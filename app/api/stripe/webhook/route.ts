export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db';
import Stripe from 'stripe';
import { updateUserPlanQuotas, initializeUserQuotas } from '@/lib/plans';
import { getStripe, getSubscriptionPeriodEnd } from '@/lib/stripe';
import { getWebhookSecretCandidates, getStripePriceId, type StripeMode } from '@/lib/stripe-mode';
import { notifyAdminNewPaidBooking } from '@/lib/system-whatsapp';
import { sendMembershipWelcome, sendMembershipOverdue } from '@/lib/email';
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
          // Booking payment (one-time or recurring membership first charge)
          const createdBooking = await handleBookingPayment(session, (event as any).account ?? null);
          if (session.metadata.membershipEvent === 'true' && session.subscription) {
            await handleMembershipCreated(session, createdBooking, eventMode);
          }
        } else {
          // Regular subscription checkout (platform plan)
          await handleCheckoutComplete(session, eventMode);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleRecurringCharge(invoice, eventMode);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription, eventMode);
        await handleMembershipStatusChanged(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        await handleMembershipStatusChanged(subscription);
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

async function handleBookingPayment(session: Stripe.Checkout.Session, eventAccountId: string | null = null) {
  const { eventTypeId, guestName, guestEmail, startTime, timezone, userId, tenantAccountId } = session.metadata || {};
  let booking: any = null;

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

    // The PaymentIntent ID lets the dashboard refund the booking later.
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    // Prefer the tenant account stored at session creation; fall back to the
    // account the event arrived from (events from connected accounts carry it).
    const stripeAccountId = (tenantAccountId || eventAccountId || null) as string | null;

    // Create the booking
    booking = await prisma.booking.create({
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
        stripePaymentIntent: paymentIntentId,
        paymentAmount: session.amount_total || eventType.price,
        paymentCurrency: session.currency || eventType.currency,
        paidAt: new Date(),
        stripeAccountId,
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
  return booking;
}

/**
 * Recurring membership: after the first charge succeeds, create (or update) the
 * tenant's client subscription record.
 */
async function handleMembershipCreated(
  session: Stripe.Checkout.Session,
  booking: any,
  eventMode: StripeMode,
) {
  try {
    const subscriptionId = session.subscription as string;
    if (!subscriptionId) return;

    const meta = session.metadata || {};
    const { eventTypeId, userId, guestName, guestEmail, tenantAccountId } = meta;
    if (!eventTypeId || !userId) return;

    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: { bookingPage: { select: { title: true } } },
    });
    if (!eventType) return;

    const stripe = await getStripe(eventMode);
    const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval ?? 'month';
    const periodStart = sub.current_period_start ?? sub.currentPeriodStart;
    const periodEnd = getSubscriptionPeriodEnd(sub);

    const data: any = {
      userId,
      eventTypeId,
      customerName: meta.guestName || booking?.guestName || 'Cliente',
      customerEmail: meta.guestEmail || booking?.guestEmail || '',
      stripeSubscriptionId: subscriptionId,
      stripeAccountId: tenantAccountId || null,
      price: eventType.price,
      currency: eventType.currency,
      interval,
      status: 'ACTIVE',
      currentPeriodStart: periodStart ? new Date(periodStart * 1000) : null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    };

    await prisma.memberSubscription.upsert({
      where: { stripeSubscriptionId: subscriptionId },
      create: data,
      update: { ...data, id: undefined },
    });

    // Confirm the subscription to the client by email.
    await sendMembershipWelcome({
      to: data.customerEmail,
      customerName: data.customerName,
      eventTitle: eventType.name,
      price: eventType.price,
      currency: eventType.currency,
      interval,
      nextChargeDate: data.currentPeriodEnd,
      bookingPageTitle: eventType.bookingPage?.title || undefined,
    });

    console.log(`✅ Membership created: ${subscriptionId} for ${data.customerEmail}`);
  } catch (error) {
    console.error('Error handling membership creation:', error);
  }
}

/**
 * Recurring membership: a renewal invoice was paid — record the payment so the
 * revenue report counts recurring income (deduped by invoice id).
 */
async function handleRecurringCharge(invoice: Stripe.Invoice, eventMode: StripeMode) {
  try {
    const inv = invoice as any;
    const subscriptionId =
      typeof inv.subscription === 'string'
        ? inv.subscription
        : (inv.subscription?.id ?? null);
    if (!subscriptionId || !inv.paid) return;

    const membership = await prisma.memberSubscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });
    if (!membership) return;

    // Idempotency: a given invoice must be counted once.
    const existing = await prisma.subscriptionPayment.findUnique({
      where: { stripeInvoiceId: inv.id },
    });
    if (existing) return;

    await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: membership.id,
        stripeInvoiceId: inv.id,
        amount: inv.amount_paid ?? membership.price,
        currency: inv.currency ?? membership.currency,
        paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : new Date(),
      },
    });

    // Refresh the current period end so the membership list stays accurate.
    if (inv.lines?.data?.[0]?.period?.end) {
      await prisma.memberSubscription.update({
        where: { id: membership.id },
        data: {
          currentPeriodEnd: new Date(inv.lines.data[0].period.end * 1000),
          status: 'ACTIVE',
        },
      });
    }

    console.log(`✅ Recurring charge recorded: ${invoice.id} (${invoice.amount_paid} ${invoice.currency})`);
  } catch (error) {
    console.error('Error handling recurring charge:', error);
  }
}

/**
 * Recurring membership: reflect subscription status changes (updated/deleted)
 * on the tenant's membership record.
 */
async function handleMembershipStatusChanged(subscription: Stripe.Subscription) {
  try {
    const sub = subscription as any;
    const membership = await prisma.memberSubscription.findUnique({
      where: { stripeSubscriptionId: subscription.id },
      include: { eventType: { select: { name: true } } },
    });
    if (!membership) return;

    const prevStatus = membership.status;
    const status =
      subscription.status === 'active' || subscription.status === 'trialing'
        ? subscription.status === 'trialing'
          ? 'TRIALING'
          : 'ACTIVE'
        : subscription.status === 'past_due' || subscription.status === 'unpaid'
          ? 'PAST_DUE'
          : 'CANCELLED';

    // getSubscriptionPeriodEnd returns unix seconds; the fallback below reads
    // the raw field (also seconds) cast through any for newer API versions.
    const periodEnd: number | null = getSubscriptionPeriodEnd(subscription) ??
      (typeof sub.current_period_end === 'number' ? sub.current_period_end : null);

    await prisma.memberSubscription.update({
      where: { id: membership.id },
      data: {
        status,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : membership.currentPeriodEnd,
      },
    });

    // When the subscription becomes overdue (PAST_DUE) for the first time,
    // warn the client by email that it will be cancelled after 30 days unless
    // renewed. The cron only processes ACTIVE/TRIALING memberships, so this
    // transition (and therefore the email) happens exactly once per lapse.
    if (status === 'PAST_DUE' && prevStatus !== 'PAST_DUE' && membership.customerEmail) {
      await sendMembershipOverdue({
        to: membership.customerEmail,
        customerName: membership.customerName,
        eventTitle: membership.eventType?.name || 'Suscripción',
        price: membership.price,
        currency: membership.currency,
        interval: membership.interval,
        periodEnded: membership.currentPeriodEnd,
        graceDays: 30,
      });
    }

    console.log(`✅ Membership status updated: ${subscription.id} -> ${status}`);
  } catch (error) {
    console.error('Error updating membership status:', error);
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