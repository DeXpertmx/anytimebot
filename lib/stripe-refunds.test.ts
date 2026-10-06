/**
 * Tests for lib/stripe-refunds.ts (node:test + tsx) — fake prisma via DI.
 *
 * Covers the two shapes a Stripe refund can arrive in:
 *  - the CARD_ONLINE mirror already exists (the usual case: the booking's
 *    payment history was opened before) → refundCents is updated in place;
 *  - the mirror does not exist yet (nobody opened the history) → the order and
 *    the CARD_ONLINE row are materialized from the booking first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mirrorStripeRefund,
  stripeChargeRefundFrom,
  stripeRefundReasonLabel,
} from './stripe-refunds';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('stripeChargeRefundFrom maps the cumulative amount and the newest refund', () => {
  const mapped = stripeChargeRefundFrom({
    payment_intent: 'pi_123',
    amount: 3000,
    amount_refunded: 1500,
    // Stripe does not guarantee the order of charge.refunds, hence `created`.
    refunds: {
      data: [
        { created: 1_700_000_000, reason: 'requested_by_customer' },
        { created: 1_700_000_500, reason: 'duplicate' },
      ],
    },
  });

  assert.equal(mapped.paymentIntentId, 'pi_123');
  assert.equal(mapped.amountRefundedCents, 1500);
  assert.equal(mapped.chargeAmountCents, 3000);
  assert.equal(mapped.reason, 'duplicate');
  assert.equal(mapped.refundedAt?.toISOString(), new Date(1_700_000_500 * 1000).toISOString());
});

test('stripeChargeRefundFrom accepts an expanded payment_intent and no refunds list', () => {
  const mapped = stripeChargeRefundFrom({
    payment_intent: { id: 'pi_expanded' },
    amount: 500,
    amount_refunded: 500,
  });
  assert.equal(mapped.paymentIntentId, 'pi_expanded');
  assert.equal(mapped.reason, null);
  assert.equal(mapped.refundedAt, null);
});

test('stripeRefundReasonLabel translates Stripe reason codes', () => {
  assert.equal(stripeRefundReasonLabel('requested_by_customer'), 'Reembolso en Stripe · a petición del cliente');
  assert.equal(stripeRefundReasonLabel('duplicate'), 'Reembolso en Stripe · cobro duplicado');
  assert.equal(stripeRefundReasonLabel('fraudulent'), 'Reembolso en Stripe · fraude');
  assert.equal(stripeRefundReasonLabel(null), 'Reembolso en Stripe');
  assert.equal(stripeRefundReasonLabel('unknown_code'), 'Reembolso en Stripe (unknown_code)');
});

// ---------------------------------------------------------------------------
// Fake prisma (only what the refund path touches)
// ---------------------------------------------------------------------------

function makeFakeDb() {
  const payments: any[] = [];
  const orders: any[] = [];
  const bookings: any[] = [];
  const audit: any[] = [];
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;

  const db: any = {
    payment: {
      findFirst: async ({ where }: any) => {
        let found = payments.filter((p) => p.stripePaymentIntent === where.stripePaymentIntent);
        if (where.orderId) found = found.filter((p) => p.orderId === where.orderId);
        return found[found.length - 1] ?? null;
      },
      findUnique: async () => null,
      create: async ({ data }: any) => {
        const payment: any = {
          id: nextId('pay'),
          status: 'COMPLETED',
          refundCents: 0,
          ...data,
        };
        payments.push(payment);
        return payment;
      },
      update: async ({ where, data }: any) => {
        const payment = payments.find((p) => p.id === where.id);
        Object.assign(payment, data);
        return payment;
      },
    },
    order: {
      findFirst: async ({ where }: any) =>
        orders.find((o) => o.id === where.id && o.userId === where.userId) ??
        orders.find((o) => o.bookingId === where.bookingId) ??
        null,
      create: async ({ data }: any) => {
        const order: any = { id: nextId('ord'), status: 'ISSUED', ...data, items: [], payments: [] };
        orders.push(order);
        return order;
      },
    },
    receipt: { findFirst: async () => null },
    booking: {
      findFirst: async ({ where }: any) =>
        bookings.find((b) => b.stripePaymentIntent === where.stripePaymentIntent) ?? null,
    },
    cashSession: { findFirst: async () => null },
    cashMovement: { create: async () => undefined },
    tenantAuditLog: { create: async ({ data }: any) => void audit.push(data) },
    $transaction: async (fn: (tx: any) => any) => fn(db),
  };

  return { db, payments, orders, bookings, audit };
}

const CHARGE = {
  paymentIntentId: 'pi_booking_1',
  amountRefundedCents: 3000,
  chargeAmountCents: 3000,
  refundedAt: new Date('2026-10-01T10:00:00.000Z'),
  reason: 'requested_by_customer',
};

function seedCardOnlinePayment(payments: any[], over: Partial<any> = {}) {
  const payment: any = {
    id: 'pay_1',
    userId: 'u1',
    orderId: 'ord_1',
    method: 'CARD_ONLINE',
    amountCents: 3000,
    currency: 'eur',
    status: 'COMPLETED',
    refundCents: 0,
    stripePaymentIntent: CHARGE.paymentIntentId,
    ...over,
  };
  payments.push(payment);
  return payment;
}

function seedStripeBooking(bookings: any[]) {
  const booking: any = {
    id: 'bk_1',
    eventTypeId: 'et_1',
    guestName: 'Ana',
    startTime: new Date('2026-10-05T09:00:00.000Z'),
    paymentStatus: 'PAID',
    paymentMethod: 'CARD_ONLINE',
    paymentAmount: 3000,
    paymentCurrency: 'eur',
    stripePaymentIntent: CHARGE.paymentIntentId,
    serviceItems: null,
    eventType: {
      name: 'Business Meeting',
      price: 3000,
      currency: 'eur',
      duration: 45,
      bookingPage: { userId: 'u1', user: { currency: 'eur' } },
    },
  };
  bookings.push(booking);
  return booking;
}

// ---------------------------------------------------------------------------
// Existing mirror row
// ---------------------------------------------------------------------------

test('a full Stripe refund is written on the CARD_ONLINE row as refundCents', async () => {
  const { db, payments, audit } = makeFakeDb();
  const payment = seedCardOnlinePayment(payments);

  const outcome = await mirrorStripeRefund(CHARGE, { prisma: db });

  assert.equal(outcome.status, 'recorded');
  assert.equal(payment.refundCents, 3000);
  assert.equal(payment.refundReason, 'Reembolso en Stripe · a petición del cliente');
  assert.equal(payment.refundedAt.toISOString(), '2026-10-01T10:00:00.000Z');
  assert.equal(payments.length, 1); // no extra row was created
  assert.equal(audit.filter((a) => a.action === 'PAYMENT_REFUND').length, 1);
  assert.equal(audit[0].details.source, 'stripe');
});

test('partial refunds accumulate from Stripe\'s cumulative amount, replay-safe', async () => {
  const { db, payments, audit } = makeFakeDb();
  const payment = seedCardOnlinePayment(payments);

  const first = await mirrorStripeRefund({ ...CHARGE, amountRefundedCents: 1000 }, { prisma: db });
  assert.equal(first.status, 'recorded');
  assert.equal(payment.refundCents, 1000);

  // Stripe redelivers the same event (retry): nothing changes, no new audit.
  const replay = await mirrorStripeRefund({ ...CHARGE, amountRefundedCents: 1000 }, { prisma: db });
  assert.equal(replay.status, 'unchanged');
  assert.equal(payment.refundCents, 1000);
  assert.equal(audit.length, 1);

  // A second partial refund arrives with the new cumulative total.
  const second = await mirrorStripeRefund({ ...CHARGE, amountRefundedCents: 2500 }, { prisma: db });
  assert.equal(second.status, 'recorded');
  assert.equal(second.status === 'recorded' && second.deltaCents, 1500);
  assert.equal(payment.refundCents, 2500);

  // The out-of-order delivery of an older (smaller) event never rewinds it.
  const stale = await mirrorStripeRefund({ ...CHARGE, amountRefundedCents: 2500 }, { prisma: db });
  assert.equal(stale.status, 'unchanged');
  assert.equal(payment.refundCents, 2500);
  assert.equal(audit.length, 2);
});

test('a refund larger than the charge is clamped to the amount collected', async () => {
  const { db, payments } = makeFakeDb();
  const payment = seedCardOnlinePayment(payments, { amountCents: 2000 });

  const outcome = await mirrorStripeRefund({ ...CHARGE, amountRefundedCents: 5000 }, { prisma: db });

  assert.equal(outcome.status, 'recorded');
  assert.equal(payment.refundCents, 2000);
});

// ---------------------------------------------------------------------------
// Materializing the mirror (no order yet)
// ---------------------------------------------------------------------------

test('a refund before anyone opened the payment history builds the CARD_ONLINE row', async () => {
  const { db, payments, orders, bookings, audit } = makeFakeDb();
  seedStripeBooking(bookings);
  assert.equal(orders.length, 0);
  assert.equal(payments.length, 0);

  const outcome = await mirrorStripeRefund(CHARGE, { prisma: db });

  assert.equal(outcome.status, 'recorded');
  assert.equal(outcome.status === 'recorded' && outcome.created, true);
  assert.equal(orders.length, 1);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].method, 'CARD_ONLINE');
  assert.equal(payments[0].stripePaymentIntent, CHARGE.paymentIntentId);
  assert.equal(payments[0].amountCents, 3000);
  assert.equal(payments[0].refundCents, 3000);
  // The mirror belongs to the tenant owner (Payment.createdById is a User FK).
  assert.equal(payments[0].createdById, 'u1');
  assert.ok(audit.some((a) => a.action === 'ORDER_CREATE'));
  assert.ok(audit.some((a) => a.action === 'PAYMENT_ADD'));
});

test('a booking already marked REFUNDED still gets its mirror (the refund is the record)', async () => {
  const { db, payments, bookings } = makeFakeDb();
  seedStripeBooking(bookings).paymentStatus = 'REFUNDED';

  const outcome = await mirrorStripeRefund(CHARGE, { prisma: db });

  assert.equal(outcome.status, 'recorded');
  assert.equal(payments.length, 1);
  assert.equal(payments[0].refundCents, 3000);
});

test('the charge amount is used when the booking lost its payment amount', async () => {
  const { db, payments, bookings } = makeFakeDb();
  seedStripeBooking(bookings).paymentAmount = null;

  const outcome = await mirrorStripeRefund({ ...CHARGE, chargeAmountCents: 4500 }, { prisma: db });

  assert.equal(outcome.status, 'recorded');
  assert.equal(payments[0].amountCents, 4500); // charge.amount, not eventType.price
  assert.equal(payments[0].refundCents, 3000); // what Stripe actually returned
});

// ---------------------------------------------------------------------------
// Nothing to mirror
// ---------------------------------------------------------------------------

test('a charge with no matching payment or booking is reported as not-found', async () => {
  const { db, payments, audit } = makeFakeDb();
  assert.deepEqual(await mirrorStripeRefund(CHARGE, { prisma: db }), { status: 'not-found' });
  assert.equal(audit.length, 0);

  // A charge without a payment intent (or with nothing refunded) is ignored.
  assert.deepEqual(
    await mirrorStripeRefund({ ...CHARGE, paymentIntentId: null }, { prisma: db }),
    { status: 'not-found' }
  );
  assert.deepEqual(
    await mirrorStripeRefund({ ...CHARGE, amountRefundedCents: 0 }, { prisma: db }),
    { status: 'not-found' }
  );
  assert.equal(payments.length, 0);
});
