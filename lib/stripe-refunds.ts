import { prisma } from '@/lib/db';
import { ensureBookingOrder, writeAudit, type Actor } from '@/lib/orders';

/**
 * Stripe refunds → `payments` mirror.
 *
 * Money collected online lives twice: Stripe owns the charge, and the
 * `payments` table keeps a read-only CARD_ONLINE mirror (`stripePaymentIntent`)
 * so the dashboard, the balance and the reports read the same numbers as
 * in-person collections. A refund issued from the Stripe dashboard — or the
 * full refund of `POST /api/bookings/[id]/refund` — is therefore mirrored here
 * as `refundCents` on that row. This module never calls Stripe.
 *
 * Idempotency: `charge.amount_refunded` is Stripe's *cumulative* truth, so the
 * mirror stores it as-is (never `+=`). The same event delivered twice, or a
 * second partial refund, converges on the same value; a replay that changes
 * nothing writes no audit row either.
 */

export interface StripeRefundDeps {
  prisma?: typeof prisma;
}

function resolveDeps(deps?: StripeRefundDeps) {
  return { db: deps?.prisma ?? prisma };
}

/** Plain shape of the Stripe charge fields we mirror (keeps Stripe types out). */
export interface StripeChargeRefund {
  /** `charge.payment_intent` (string id, or the expanded object's id). */
  paymentIntentId: string | null;
  /** `charge.amount_refunded` — cumulative refunded amount, in cents. */
  amountRefundedCents: number;
  /** `charge.amount` — the full charge, used when the booking lost its amount. */
  chargeAmountCents?: number | null;
  /** When the latest refund happened. */
  refundedAt?: Date | null;
  /** Stripe's reason code of the latest refund. */
  reason?: string | null;
}

export type StripeRefundOutcome =
  | {
      status: 'recorded';
      paymentId: string;
      userId: string;
      orderId: string;
      refundCents: number;
      deltaCents: number;
      /** True when this refund had to build the order + CARD_ONLINE row first. */
      created: boolean;
    }
  | { status: 'unchanged'; paymentId: string; userId: string; orderId: string; refundCents: number }
  | { status: 'not-found' };

/**
 * Structural view of the Stripe charge fields the mirror reads. Keeping it
 * structural (instead of `Stripe.Charge`) lets the routes hand over the payload
 * as-is while the mapping stays testable without the SDK.
 */
export interface StripeChargeLike {
  payment_intent?: string | { id?: string } | null;
  amount?: number | null;
  amount_refunded?: number | null;
  refunds?: { data?: Array<{ created?: number | null; reason?: string | null }> | null } | null;
}

/**
 * Map a Stripe charge onto the mirror input. `amount_refunded` is cumulative;
 * the newest refund (by `created`, in seconds) supplies the reason and the
 * timestamp, since `charge.refunds` is not ordered by contract.
 */
export function stripeChargeRefundFrom(charge: StripeChargeLike): StripeChargeRefund {
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : (charge.payment_intent?.id ?? null);

  const newest = (charge.refunds?.data ?? []).reduce<{ created?: number | null; reason?: string | null } | null>(
    (latest, refund) => (!latest || (refund.created ?? 0) > (latest.created ?? 0) ? refund : latest),
    null
  );

  return {
    paymentIntentId,
    amountRefundedCents: charge.amount_refunded ?? 0,
    chargeAmountCents: charge.amount ?? null,
    refundedAt: newest?.created ? new Date(newest.created * 1000) : null,
    reason: newest?.reason ?? null,
  };
}

const STRIPE_REFUND_REASONS: Record<string, string> = {
  duplicate: 'cobro duplicado',
  fraudulent: 'fraude',
  requested_by_customer: 'a petición del cliente',
};

/** Human (Spanish) label for Stripe's refund reason code. */
export function stripeRefundReasonLabel(reason?: string | null): string {
  if (!reason) return 'Reembolso en Stripe';
  const known = STRIPE_REFUND_REASONS[reason];
  return known ? `Reembolso en Stripe · ${known}` : `Reembolso en Stripe (${reason})`;
}

/**
 * Record a refund on the CARD_ONLINE mirror of a charge.
 *
 * The payment history is built lazily, so the refund can arrive before anybody
 * ever opened the booking's payments panel: when there is no mirror row yet the
 * order is materialized from the booking first (the charge was really
 * collected — Stripe says so — even if a previous refund already flipped the
 * booking to REFUNDED), then the refund is written on top of it.
 */
export async function mirrorStripeRefund(
  charge: StripeChargeRefund,
  deps?: StripeRefundDeps
): Promise<StripeRefundOutcome> {
  const { db } = resolveDeps(deps);
  const intentId = charge.paymentIntentId;
  const refundedCents = Math.max(0, Math.round(Number(charge.amountRefundedCents) || 0));
  if (!intentId || refundedCents <= 0) return { status: 'not-found' };

  let payment = await db.payment.findFirst({
    where: { stripePaymentIntent: intentId },
    orderBy: { createdAt: 'desc' },
  });
  let created = false;

  if (!payment) {
    payment = await materializeMirror(db, charge, intentId);
    if (!payment) return { status: 'not-found' };
    created = true;
  }

  // Never refund more than the charge itself: Stripe cannot either.
  const target = Math.min(refundedCents, payment.amountCents);
  const previous = payment.refundCents ?? 0;
  if (previous === target) {
    return {
      status: 'unchanged',
      paymentId: payment.id,
      userId: payment.userId,
      orderId: payment.orderId,
      refundCents: target,
    };
  }

  const updated = await db.payment.update({
    where: { id: payment.id },
    data: {
      refundCents: target,
      refundReason: stripeRefundReasonLabel(charge.reason),
      refundedAt: charge.refundedAt ?? new Date(),
    },
  });

  await writeAudit(db, {
    userId: payment.userId,
    // No FK on the audit actor: the tenant that owns the money is recorded,
    // with Stripe as the acting name (the owner never clicked anything here).
    actorId: payment.userId,
    actorName: 'Stripe',
    action: 'PAYMENT_REFUND',
    targetId: payment.id,
    details: {
      orderId: payment.orderId,
      source: 'stripe',
      stripePaymentIntent: intentId,
      amountCents: target - previous,
      totalRefundCents: target,
      reason: charge.reason ?? null,
    },
  });

  return {
    status: 'recorded',
    paymentId: updated.id,
    userId: updated.userId,
    orderId: updated.orderId,
    refundCents: target,
    deltaCents: target - previous,
    created,
  };
}

/**
 * Build the order + CARD_ONLINE row of a booking that only carries the charge
 * in its flat columns. Returns null when the intent matches no booking (nothing
 * to mirror onto) or the booking has no amount at all.
 */
async function materializeMirror(
  db: typeof prisma,
  charge: StripeChargeRefund,
  intentId: string
): Promise<any | null> {
  const booking = await db.booking.findFirst({
    where: { stripePaymentIntent: intentId },
    include: {
      eventType: {
        select: {
          name: true,
          price: true,
          currency: true,
          duration: true,
          bookingPage: { select: { userId: true, user: { select: { currency: true } } } },
        },
      },
    },
  });
  if (!booking) return null;

  const amount = booking.paymentAmount ?? charge.chargeAmountCents ?? 0;
  if (!amount || amount <= 0) return null;

  const userId = booking.eventType.bookingPage.userId;
  const actor: Actor = { id: userId, name: 'Stripe' };

  const order = await ensureBookingOrder(
    {
      id: booking.id,
      guestName: booking.guestName,
      startTime: booking.startTime,
      // The charge was collected online: the mirror is built as the payment it
      // was, and the refund is then recorded on top of it (refundCents).
      paymentStatus: 'PAID',
      paymentMethod: booking.paymentMethod ?? 'CARD_ONLINE',
      paymentAmount: amount,
      paymentCurrency: booking.paymentCurrency,
      stripePaymentIntent: intentId,
      serviceItems: booking.serviceItems,
      eventTypeId: booking.eventTypeId,
      eventType: booking.eventType,
    },
    actor,
    { prisma: db }
  );

  return db.payment.findFirst({
    where: { stripePaymentIntent: intentId, orderId: order.id },
  });
}
