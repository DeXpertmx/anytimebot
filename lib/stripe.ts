import Stripe from 'stripe';

let _stripe: Stripe | null = null;

/**
 * Lazily initialize the Stripe client so module imports do not fail at build
 * time when STRIPE_SECRET_KEY is not configured yet.
 */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-10-29.clover',
      typescript: true,
    });
  }
  return _stripe;
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
