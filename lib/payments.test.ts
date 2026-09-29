/**
 * Tests for lib/payments.ts (node:test + tsx) — fake prisma via DI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addPaymentToOrder,
  annulPayment,
  refundPayment,
  validatePaymentAmount,
  resolvePaymentMethod,
} from './payments';

function makeFakeDb() {
  const payments: any[] = [];
  const movements: any[] = [];
  const audit: any[] = [];
  let seq = 0;
  const nextId = () => `pay_${++seq}`;

  function makeOrder(over: Partial<any> = {}) {
    return {
      id: `ord_${++seq}`,
      userId: 'u1',
      status: 'ISSUED',
      currency: 'eur',
      locationId: null,
      items: [{ quantity: 1, unitCents: 3000 }],
      payments: [] as any[],
      ...over,
    };
  }

  const state = { orders: [] as any[] };
  const db: any = {
    order: {
      findFirst: async ({ where }: any) =>
        state.orders.find((o) => o.id === where.id && o.userId === where.userId) ?? null,
    },
    payment: {
      findUnique: async ({ where }: any) =>
        payments.find(
          (p) => p.userId === where.userId_idempotencyKey.userId && p.idempotencyKey === where.userId_idempotencyKey.idempotencyKey
        ) ?? null,
      findFirst: async ({ where }: any) => payments.find((p) => p.id === where.id && p.userId === where.userId) ?? null,
      create: async ({ data }: any) => {
        const p: any = {
          id: nextId(),
          status: 'COMPLETED',
          refundCents: 0,
          method: data.method,
          amountCents: data.amountCents,
          orderId: data.orderId,
          userId: data.userId,
          idempotencyKey: data.idempotencyKey ?? null,
          order: state.orders.find((o) => o.id === data.orderId) ?? null,
        };
        payments.push(p);
        const order = state.orders.find((o) => o.id === data.orderId);
        if (order) order.payments.push(p);
        return p;
      },
      update: async ({ where, data }: any) => {
        const p = payments.find((x) => x.id === where.id);
        Object.assign(p, data);
        return p;
      },
    },
    cashSession: { findFirst: async () => null }, // no open drawer in these tests
    cashMovement: { create: async ({ data }: any) => void movements.push(data) },
    tenantAuditLog: { create: async ({ data }: any) => void audit.push(data) },
    $transaction: async (fn: (tx: any) => any) => fn(db),
  };

  return { db, payments, movements, audit, makeOrder, state };
}

const actor = { id: 'u1', name: 'Owner' };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

test('validatePaymentAmount rounds and rejects zero/negative/garbage', () => {
  assert.equal(validatePaymentAmount(1500), 1500);
  assert.equal(validatePaymentAmount(10.4), 10);
  assert.throws(() => validatePaymentAmount(0), /mayor que cero/);
  assert.throws(() => validatePaymentAmount(-5), /mayor que cero/);
  assert.throws(() => validatePaymentAmount('abc'), /mayor que cero/);
});

test('resolvePaymentMethod accepts manual methods and rejects unknown ones', () => {
  assert.equal(resolvePaymentMethod('CASH'), 'CASH');
  assert.equal(resolvePaymentMethod('BIZUM'), 'BIZUM');
  assert.equal(resolvePaymentMethod('CARD_ONLINE'), 'CARD_ONLINE'); // mirror only
  assert.throws(() => resolvePaymentMethod('PAYPAL'), /no válido/);
});

// ---------------------------------------------------------------------------
// addPaymentToOrder
// ---------------------------------------------------------------------------

test('addPaymentToOrder creates payment + application and audits', async () => {
  const { db, payments, audit, state, makeOrder } = makeFakeDb();
  const order = makeOrder();
  state.orders.push(order);

  const { payment, idempotentReplay } = await addPaymentToOrder(
    { userId: 'u1', orderId: order.id, method: 'CASH', amountCents: 3000, actor },
    { prisma: db }
  );

  assert.equal(idempotentReplay, false);
  assert.equal(payment.amountCents, 3000);
  assert.equal(payments.length, 1);
  assert.equal(audit.filter((a) => a.action === 'PAYMENT_ADD').length, 1);
});

test('addPaymentToOrder is idempotent for repeated idempotency keys', async () => {
  const { db, payments, state, makeOrder } = makeFakeDb();
  const order = makeOrder();
  state.orders.push(order);
  const input = {
    userId: 'u1',
    orderId: order.id,
    method: 'CARD_ONSITE',
    amountCents: 1000,
    idempotencyKey: 'key-1',
    actor,
  };

  const first = await addPaymentToOrder(input, { prisma: db });
  const second = await addPaymentToOrder(input, { prisma: db });

  assert.equal(first.idempotentReplay, false);
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.payment.id, first.payment.id);
  assert.equal(payments.length, 1);
});

test('addPaymentToOrder rejects voided orders and wrong currency', async () => {
  const { db, state, makeOrder } = makeFakeDb();
  const voided = makeOrder({ status: 'VOID' });
  state.orders.push(voided);
  await assert.rejects(
    () => addPaymentToOrder({ userId: 'u1', orderId: voided.id, method: 'CASH', amountCents: 100, actor }, { prisma: db }),
    (err: any) => err.status === 409
  );

  const order = makeOrder();
  state.orders.push(order);
  await assert.rejects(
    () =>
      addPaymentToOrder(
        { userId: 'u1', orderId: order.id, method: 'CASH', amountCents: 100, currency: 'USD', actor },
        { prisma: db }
      ),
    /moneda/
  );
});

test('cash payment with no open drawer still succeeds (drawer optional)', async () => {
  const { db, state, makeOrder } = makeFakeDb();
  const order = makeOrder();
  state.orders.push(order);
  // No cashSession model on the fake: getCashSession returns undefined → skipped.

  const { payment } = await addPaymentToOrder(
    { userId: 'u1', orderId: order.id, method: 'CASH', amountCents: 2000, actor },
    { prisma: db }
  );
  assert.equal(payment.amountCents, 2000);
});

// ---------------------------------------------------------------------------
// annulPayment / refundPayment
// ---------------------------------------------------------------------------

function seedPayment(db: any, payments: any[], over: Partial<any> = {}) {
  const p: any = {
    id: `pay_${payments.length + 1}`,
    userId: 'u1',
    orderId: 'ord_1',
    method: 'CASH',
    amountCents: 3000,
    currency: 'eur',
    status: 'COMPLETED',
    refundCents: 0,
    order: { id: 'ord_1', items: [{ quantity: 1, unitCents: 3000 }], locationId: null },
    ...over,
  };
  payments.push(p);
  return p;
}

test('annulPayment marks ANNULLED with reason and actor', async () => {
  const { db, payments, audit } = makeFakeDb();
  const p = seedPayment(db, payments);

  const updated = await annulPayment(p.id, 'u1', 'importe equivocado', actor, { prisma: db });
  assert.equal(updated.status, 'ANNULLED');
  assert.equal(updated.annulledReason, 'importe equivocado');
  assert.equal(updated.annulledById, 'u1');
  assert.equal(audit.filter((a) => a.action === 'PAYMENT_ANNUL').length, 1);
});

test('annulPayment refuses already-inactive payments and empty reasons', async () => {
  const { db, payments } = makeFakeDb();
  const p = seedPayment(db, payments, { status: 'ANNULLED' });
  await assert.rejects(
    () => annulPayment(p.id, 'u1', 'x', actor, { prisma: db }),
    (err: any) => err.status === 409
  );
  const active = seedPayment(db, payments);
  await assert.rejects(() => annulPayment(active.id, 'u1', '  ', actor, { prisma: db }), /motivo/);
});

test('refundPayment allows partial then full, never over-refunds', async () => {
  const { db, payments, audit } = makeFakeDb();
  const p = seedPayment(db, payments);

  const partial = await refundPayment(
    { paymentId: p.id, userId: 'u1', amountCents: 1000, reason: 'producto dañado', actor },
    { prisma: db }
  );
  assert.equal(partial.refundCents, 1000);

  const rest = await refundPayment({ paymentId: p.id, userId: 'u1', reason: 'resto', actor }, { prisma: db });
  assert.equal(rest.refundCents, 3000);

  await assert.rejects(
    () => refundPayment({ paymentId: p.id, userId: 'u1', amountCents: 1, reason: 'de más', actor }, { prisma: db }),
    /supera/
  );
  assert.equal(audit.filter((a) => a.action === 'PAYMENT_REFUND').length, 2);
});
