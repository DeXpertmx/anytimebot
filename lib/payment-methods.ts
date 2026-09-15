/**
 * Payment methods for bookings.
 *
 * Two families:
 *  - `CARD_ONLINE` — money collected by Stripe Checkout, written by the Stripe
 *    webhook. Refunds go through Stripe.
 *  - everything else — money collected **in person** (cash, card terminal,
 *    transfer, Bizum). The owner records them from the dashboard with
 *    POST /api/bookings/[id]/payment and there is nothing to refund in Stripe;
 *    an incorrect record is annulled with DELETE on the same route.
 *
 * Pure and dependency-free so both the server routes and the client components
 * can share the labels.
 */

export const MANUAL_PAYMENT_METHODS = ['CASH', 'CARD_ONSITE', 'TRANSFER', 'BIZUM', 'OTHER'] as const;

export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export const ALL_PAYMENT_METHODS = [...MANUAL_PAYMENT_METHODS, 'CARD_ONLINE'] as const;

export type PaymentMethod = (typeof ALL_PAYMENT_METHODS)[number];

const LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD_ONSITE: 'Tarjeta en sitio',
  TRANSFER: 'Transferencia',
  BIZUM: 'Bizum',
  CARD_ONLINE: 'Tarjeta online (Stripe)',
  OTHER: 'Otro',
};

export function isManualPaymentMethod(value: unknown): value is ManualPaymentMethod {
  return typeof value === 'string' && (MANUAL_PAYMENT_METHODS as readonly string[]).includes(value);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === 'string' && (ALL_PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Human label (Spanish, the app's default language) — used in emails and CSV. */
export function paymentMethodLabel(value?: string | null): string | null {
  if (!value) return null;
  return isPaymentMethod(value) ? LABELS[value] : value;
}

/**
 * True when a booking was paid outside Stripe: either it carries a manual
 * method or it has no Stripe session/intent behind it.
 */
export function isManualPayment(booking: {
  paymentMethod?: string | null;
  stripeSessionId?: string | null;
  stripePaymentIntent?: string | null;
}): boolean {
  if (booking.paymentMethod && booking.paymentMethod !== 'CARD_ONLINE') return true;
  return !booking.stripeSessionId && !booking.stripePaymentIntent;
}
