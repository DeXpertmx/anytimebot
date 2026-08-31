import Stripe from 'stripe';
import { prisma } from '@/lib/db';
import { initializeUserQuotas, type PlanTier } from '@/lib/plans';

export interface FoundersBasicDeps {
  prisma?: {
    user: {
      findFirst: (args: unknown) => Promise<any>;
      findUnique: (args: unknown) => Promise<any>;
      update: (args: unknown) => Promise<any>;
    };
  };
  initializeQuotas?: (userId: string, plan: PlanTier) => Promise<void>;
}

function getDeps(deps?: FoundersBasicDeps) {
  return {
    db: deps?.prisma ?? prisma,
    initializeQuotas: deps?.initializeQuotas ?? initializeUserQuotas,
  };
}

/**
 * Activates the one-time Founders Basic entitlement after Stripe confirms payment.
 * Returns false when the event is not paid, the user is missing, or it was already processed.
 */
export async function activateFoundersBasicPurchase(
  session: Stripe.Checkout.Session,
  deps?: FoundersBasicDeps,
): Promise<boolean> {
  const { db, initializeQuotas } = getDeps(deps);
  const userId = session.metadata?.userId;
  const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : null;

  // Card Checkout sessions should always have a PaymentIntent. Requiring it gives
  // retries a stable idempotency key instead of granting an entitlement twice.
  if (!userId || session.payment_status !== 'paid' || !paymentIntentId) {
    console.warn(`Founders Basic checkout is not ready for activation: ${session.id}`);
    return false;
  }

  const alreadyProcessed = await db.user.findFirst({
    where: {
      OR: [
        { foundersBasicPaymentIntentId: paymentIntentId },
        { foundersBasicCheckoutSessionId: session.id, plan: 'BASIC' },
      ],
    },
    select: { id: true },
  });
  if (alreadyProcessed) return false;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, plan: true },
  });
  if (!user) {
    console.error('User not found for Founders Basic purchase:', userId);
    return false;
  }

  // The founders purchase is a one-time entitlement. Never grant it again,
  // including when a second Checkout session is delivered after the first one.
  if (user.plan === 'BASIC') {
    console.warn(`Ignoring duplicate Founders Basic purchase for user ${userId}`);
    return false;
  }
  if (user.plan !== 'FREE') {
    console.warn(`Ignoring Founders Basic purchase for user already on ${user.plan}: ${userId}`);
    return false;
  }

  try {
    await db.user.update({
      where: { id: userId },
      data: {
        plan: 'BASIC',
        subscriptionStatus: null,
        foundersBasicCheckoutSessionId: session.id,
        foundersBasicPaymentIntentId: paymentIntentId,
      },
    });
  } catch (error: any) {
    // A concurrent Stripe retry can win the unique payment-intent constraint.
    // Treat that race as an already-processed event, not a failed webhook.
    if (error?.code === 'P2002') return false;
    throw error;
  }

  await initializeQuotas(userId, 'BASIC');
  console.log(`✅ Founders Basic activated for user ${userId}`);
  return true;
}

/** Revokes Founders Basic only when a full refund is confirmed and no upgrade superseded it. */
export async function revokeFoundersBasicRefund(
  charge: Stripe.Charge,
  deps?: FoundersBasicDeps,
): Promise<boolean> {
  const { db, initializeQuotas } = getDeps(deps);
  if (!charge.refunded) return false;
  const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
  if (!paymentIntentId) return false;

  const user = await db.user.findFirst({
    where: { foundersBasicPaymentIntentId: paymentIntentId },
    select: { id: true, plan: true },
  });
  if (!user || user.plan !== 'BASIC') return false;

  await db.user.update({
    where: { id: user.id },
    data: {
      plan: 'FREE',
      subscriptionStatus: 'CANCELLED',
      foundersBasicCheckoutSessionId: null,
      foundersBasicPaymentIntentId: null,
    },
  });
  await initializeQuotas(user.id, 'FREE');
  console.log(`✅ Founders Basic entitlement revoked after refund for user ${user.id}`);
  return true;
}
