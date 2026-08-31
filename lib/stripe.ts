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