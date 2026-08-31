export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';
import { updateUserPlanQuotas, initializeUserQuotas } from '@/lib/plans';
import { getStripe, getSubscriptionPeriodEnd } from '@/lib/stripe';
import { getWebhookSecretCandidates, getStripePriceId, type StripeMode } from '@/lib/stripe-mode';
import { notifyAdminNewPaidBooking } from '@/lib/system-whatsapp';
import { activateFoundersBasicPurchase, revokeFoundersBasicRefund } from '@/lib/founders-basic';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  // Try the configured signing secrets in order (live first, then test).
  // The secret that verifies determines which mode the event belongs to.
  let event: Stripe.Event | null = null;
  let eventMode: StripeMode = 'live';

  for (const candidate of await getWebhookSecretCandidates()) {
    try {
      event = (await getStripe(candidate.mode)).webhooks.constructEvent(
        body,
        signature,
        candidate.secret,
      );
      eventMode = candidate.mode;
      break;
    } catch (err: any) {
      // Only keep the last error for reporting; keep trying other secrets.
      event = null;
      console.warn(
        `Webhook signature verification failed for ${candidate.mode} mode: ${err.message}`,
      );
    }
  }

  if (!event) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;

        if (session.metadata?.plan === 'BASIC') {
          await activateFoundersBasicPurchase(session);
        } else if (session.metadata?.eventTypeId && session.metadata?.guestEmail) {
          // Booking payment
          await handleBookingPayment(session);
        } else {
          // Regular subscription checkout
          await handleCheckoutComplete(session, eventMode);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription, eventMode);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await revokeFoundersBasicRefund(charge);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleBookingPayment(session: Stripe.Checkout.Session) {
  const { eventTypeId, guestName, guestEmail, startTime, timezone, userId } = session.metadata || {};

  if (!eventTypeId || !guestName || !guestEmail || !startTime || !userId) {
    console.error('Missing metadata for booking payment');
    return;
  }

  try {
    // Stripe may retry webhook deliveries; a session must create at most one booking.
    const existingBooking = await prisma.booking.findFirst({
      where: { stripeSessionId: session.id },
      select: { id: true },
    });
    if (existingBooking) return;

    // Get event type
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
    });

    if (!eventType) {
      console.error('Event type not found:', eventTypeId);
      return;
    }

    // Calculate end time
    const bookingStartTime = new Date(startTime);
    const bookingEndTime = new Date(bookingStartTime.getTime() + eventType.duration * 60 * 1000);

    // Create the booking
    const booking = await prisma.booking.create({
      data: {
        eventTypeId,
        guestName,
        guestEmail,
        startTime: bookingStartTime,
        endTime: bookingEndTime,
        timezone: timezone || 'UTC',
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        stripeSessionId: session.id,
        paymentAmount: session.amount_total || eventType.price,
        paymentCurrency: session.currency || eventType.currency,
        paidAt: new Date(),
      },
      include: {
        eventType: {
          include: {
            bookingPage: true,
          },
        },
      },
    });

    console.log(`✅ Booking payment confirmed for booking ${booking.id}`);
    console.log(`   Guest: ${guestName} (${guestEmail})`);
    console.log(`   Event: ${eventType.name}`);
    console.log(`   Time: ${startTime}`);
    console.log(`   Amount: ${session.amount_total} ${session.currency}`);

    // Notify the Anytimebot admin of the new paid booking via the system WhatsApp number.
    await notifyAdminNewPaidBooking({
      guestName,
      guestEmail,
      eventTypeName: eventType.name,
      startTime: bookingStartTime,
      timezone: timezone || 'UTC',
      amount: session.amount_total ?? eventType.price,
      currency: session.currency ?? eventType.currency,
    });

    // TODO: Send confirmation email
    // TODO: Send WhatsApp notification
    // TODO: Create Google Calendar event

  } catch (error) {
    console.error('Error creating booking after payment:', error);
  }
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session, eventMode: StripeMode) {
  const userId = session.metadata?.userId;

  if (!userId) {
    console.error('No userId in checkout session metadata');
    return;
  }

  const subscriptionId = session.subscription as string;

  if (!subscriptionId) {
    console.error('No subscription ID in session');
    return;
  }

  const subscription = await (await getStripe(eventMode)).subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;

  // Determine plan from price ID (mode aware)
  let plan: 'PRO' | 'TEAM' = 'PRO';
  if (priceId === (await getStripePriceId(eventMode, 'TEAM'))) {
    plan = 'TEAM';
  }

  // Update user
  const periodEnd = getSubscriptionPeriodEnd(subscription);
  await prisma.user.update({
    where: { id: userId },
    data: {
      plan,
      stripeSubscriptionId: subscriptionId,
      subscriptionStatus: 'ACTIVE',
      ...(periodEnd ? { subscriptionEndsAt: new Date(periodEnd * 1000) } : {}),
    },
  });

  // Initialize or update quotas
  await initializeUserQuotas(userId, plan);

  console.log(`✅ User ${userId} upgraded to ${plan}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventMode: StripeMode) {
  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!user) {
    console.error('User not found for subscription:', subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  let plan: 'PRO' | 'TEAM' = 'PRO';
  if (priceId === (await getStripePriceId(eventMode, 'TEAM'))) {
    plan = 'TEAM';
  }

  const periodEnd = getSubscriptionPeriodEnd(subscription);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan,
      subscriptionStatus: subscription.status === 'active' ? 'ACTIVE' : 'CANCELLED',
      ...(periodEnd ? { subscriptionEndsAt: new Date(periodEnd * 1000) } : {}),
    },
  });

  await updateUserPlanQuotas(user.id, plan);

  console.log(`✅ Subscription updated for user ${user.id}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!user) {
    console.error('User not found for subscription:', subscription.id);
    return;
  }

  // Downgrade to FREE (keep BASIC when the subscription is a paid one-time purchase)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      plan: user.plan === 'BASIC' ? 'BASIC' : 'FREE',
      subscriptionStatus: 'CANCELLED',
      stripeSubscriptionId: null,
    },
  });

  const fallbackPlan = user.foundersBasicPaymentIntentId ? 'BASIC' : 'FREE';
  await updateUserPlanQuotas(user.id, fallbackPlan);

  console.log(`✅ User ${user.id} downgraded to ${fallbackPlan}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription as string;

  if (!subscriptionId) return;

  const user = await prisma.user.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
  });

  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'PAST_DUE',
    },
  });

  console.log(`⚠️ Payment failed for user ${user.id}`);
}