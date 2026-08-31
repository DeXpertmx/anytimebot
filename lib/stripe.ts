import Stripe from 'stripe';
import { getStripeKeys, type StripeMode } from '@/lib/stripe-mode';

const _clients: Partial<Record<StripeMode, Stripe>> = {};

/**
 * Lazily initialize the Stripe client for a mode so module imports do not fail
 * at build time when the corresponding key is not configured yet.
 *
 * Resolves credentials from saved admin settings first, then environment
 * variables. Defaults to the live mode to preserve existing callers; flows
 * that need the operator-selected mode should resolve it first with
 * `getStripeMode()`.
 */
export async function getStripe(mode: StripeMode = 'live'): Promise<Stripe> {
  const { secretKey } = await getStripeKeys(mode);
  if (!secretKey) {
    throw new Error(`STRIPE_SECRET_KEY${mode === 'test' ? '_TEST' : ''} is not set`);
  }
  if (!_clients[mode]) {
    _clients[mode] = new Stripe(secretKey, {
      apiVersion: '2025-10-29.clover',
      typescript: true,
    });
  }
  return _clients[mode] as Stripe;
}

/**
 * Computes the current subscription period end in seconds.
 *
 * Newer Stripe API versions (e.g. 2025-10-29.clover) stopped populating
 * `current_period_end` on Subscription objects; the anchor and the price
 * interval are used instead to derive the period end.
 */
export function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): number | null {
  const sub = subscription as any;
  const periodEnd = sub.current_period_end ?? sub.currentPeriodEnd;
  if (typeof periodEnd === 'number' && Number.isFinite(periodEnd)) {
    return periodEnd;
  }

  const anchor = sub.billing_cycle_anchor ?? sub.billingCycleAnchor;
  if (typeof anchor !== 'number' || !Number.isFinite(anchor)) {
    return null;
  }

  const interval = subscription.items?.data?.[0]?.price?.recurring?.interval;
  const intervalCount = subscription.items?.data?.[0]?.price?.recurring?.interval_count ?? 1;
  const multiplier = interval === 'day' ? 1 : interval === 'week' ? 7 : interval === 'year' ? 365 : 30;
  return anchor + multiplier * intervalCount * 86400;
}

// Plan configurations
export const PLANS = {
  FREE: {
    name: 'Free',
    price: 0,
    bookingsPerMonth: 10,
    features: [
      '10 bookings per month',
      'Basic AI assistant',
      '1 booking page',
      'Email notifications',
    ],
  },
  PREMIUM: {
    name: 'Premium',
    price: 29, // $29/month
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium',
    bookingsPerMonth: -1, // unlimited
    features: [
      'Unlimited bookings',
      'Advanced AI assistant with custom training',
      'Unlimited booking pages',
      'Priority support',
      'Custom branding',
      'WhatsApp & Telegram integration',
    ],
  },
};