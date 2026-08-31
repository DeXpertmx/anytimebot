export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, getSubscriptionPeriodEnd } from '@/lib/stripe';
import { prisma as db } from '@/lib/db';
import Stripe from 'stripe';
import { activateFoundersBasicPurchase, revokeFoundersBasicRefund } from '@/lib/founders-basic';
import { updateUserPlanQuotas } from '@/lib/plans';
import { getWebhookSecretCandidates, getStripePriceId, type StripeMode } from '@/lib/stripe-mode';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

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
    } catch (error) {
      event = null;
      console.warn(
        `Webhook signature verification failed for ${candidate.mode} mode:`,
        error,
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
        const userId = session.metadata?.userId;

        if (session.metadata?.plan === 'BASIC') {
          await activateFoundersBasicPurchase(session);
        } else if (userId && session.subscription) {
          const subscriptionId = session.subscription as string;
          const plan = session.metadata?.plan === 'TEAM' ? 'TEAM' : 'PRO';

          await db.user.update({
            where: { id: userId },
            data: {
              plan,
              stripeSubscriptionId: subscriptionId,
              subscriptionStatus: 'ACTIVE',
            },
          });
          await updateUserPlanQuotas(userId, plan);

          // Stripe can retry the same event; keep one subscription record.
          await db.subscription.upsert({
            where: { stripeSubscriptionId: subscriptionId },
            create: {
              userId,
              plan,
              status: 'ACTIVE',
              stripeSubscriptionId: subscriptionId,
            },
            update: {
              plan,
              status: 'ACTIVE',
            },
          });
        }
        break;
      }

      case 'charge.refunded': {
        await revokeFoundersBasicRefund(event.data.object as Stripe.Charge);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const user = await db.user.findFirst({
          where: { stripeSubscriptionId: subscription.id },
          select: { id: true },
        });

        if (user) {
          const priceId = subscription.items.data[0]?.price.id;
          const plan = priceId === (await getStripePriceId(eventMode, 'TEAM')) ? 'TEAM' : 'PRO';
          const status = mapSubscriptionStatus(subscription.status);
          const periodEndSeconds = getSubscriptionPeriodEnd(subscription);
          const periodEnd = periodEndSeconds ? new Date(periodEndSeconds * 1000) : null;

          await db.user.update({
            where: { id: user.id },
            data: {
              plan,
              subscriptionStatus: status,
              subscriptionEndsAt: periodEnd,
            },
          });
          await updateUserPlanQuotas(user.id, plan);

          await db.subscription.updateMany({
            where: { stripeSubscriptionId: subscription.id },
            data: {
              plan,
              status,
              ...(periodEnd ? { stripeCurrentPeriodEnd: periodEnd } : {}),
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const user = await db.user.findFirst({
          where: { stripeSubscriptionId: subscription.id },
          select: { id: true, foundersBasicPaymentIntentId: true },
        });

        if (user) {
          await db.user.update({
            where: { id: user.id },
            data: {
              plan: user.foundersBasicPaymentIntentId ? 'BASIC' : 'FREE',
              subscriptionStatus: 'CANCELLED',
              stripeSubscriptionId: null,
            },
          });
        }

        await db.subscription.updateMany({
          where: { stripeSubscriptionId: subscription.id },
          data: {
            status: 'CANCELLED',
          },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

function mapSubscriptionStatus(status: Stripe.Subscription.Status): 'ACTIVE' | 'CANCELLED' | 'PAST_DUE' | 'UNPAID' | 'TRIALING' {
  switch (status) {
    case 'active': return 'ACTIVE';
    case 'past_due': return 'PAST_DUE';
    case 'unpaid': return 'UNPAID';
    case 'trialing': return 'TRIALING';
    default: return 'CANCELLED';
  }
}