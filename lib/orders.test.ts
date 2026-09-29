/**
 * Tests for lib/orders.ts (node:test + tsx).
 *
 * Pure helpers are tested directly; mutations run against a fake prisma client
 * (dependency injection, same pattern as lib/invoices.test.ts) — no database.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateOrderItems,
  orderTotalCents,
  orderBalanceCents,
  formatReceiptNumber,
  nextReceiptNumber,
  createOrder,
  voidOrder,
  OrderError,
} from './orders';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('validateOrderItems accepts a normal sale and fills defaults', () => {
  const res = validateOrderItems([{ description: 'Corte', unitCents: 1500 }]);
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.deepEqual(res.normalized, [
      { description: 'Corte', quantity: 1, unitCents: 1500, taxRateBps: null },
    ]);
  }
});

test('validateOrderItems rejects empty, unnamed, negative and bad tax lines', () => {
  assert.equal(validateOrderItems([]).ok, false);
  assert.equal(validateOrderItems('nope' as any).ok, false);
  const unnamed = validateOrderItems([{ unitCents: 100 }]);
  assert.equal(unnamed.ok, false);
  if (!unnamed.ok) assert.match(unnamed.error, /descripción/);
  const negative = validateOrderItems([{ description: 'X', unitCents: -1 }]);
  assert.equal(negative.ok, false);
  const zeroQty = validateOrderItems([{ description: 'X', quantity: 0, unitCents: 100 }]);
  assert.equal(zeroQty.ok, false);
  const badTax = validateOrderItems([{ description: 'X', unitCents: 100, taxRateBps: 25000 }]);
  assert.equal(badTax.ok, false);
});

test('orderTotalCents multiplies quantity by unit', () => {
  assert.equal(orderTotalCents([{ quantity: 2, unitCents: 1500 }, { quantity: 1, unitCents: 500 }]), 3500);
});

test('orderBalanceCents: unpaid → partial → paid → refund returns to unpaid', () => {
  const p = (status: string, amountCents: number, refundCents = 0) => ({ status, amountCents, refundCents });

  const unpaid = orderBalanceCents(3000, [p('COMPLETED', 1000)]);
  assert.equal(unpaid.state, 'PARTIAL');
  assert.equal(unpaid.due, 2000);

  const paid = orderBalanceCents(3000, [p('COMPLETED', 1000), p('COMPLETED', 2000)]);
  assert.equal(paid.state, 'PAID');
  assert.equal(paid.due, 0);

  const annulledOnly = orderBalanceCents(3000, [p('ANNULLED', 3000)]);
  assert.equal(annulledOnly.state, 'UNPAID');

  const refundedAll = orderBalanceCents(3000, [p('COMPLETED', 3000, 3000)]);
  assert.equal(refundedAll.state, 'UNPAID');
  assert.equal(refundedAll.net, 0);

  const partialRefund = orderBalanceCents(3000, [p('COMPLETED', 3000, 1000)]);
  assert.equal(partialRefund.state, 'PARTIAL');
  assert.equal(partialRefund.due, 1000);

  const overpaid = orderBalanceCents(3000, [p('COMPLETED', 4000)]);
  assert.equal(overpaid.state, 'OVERPAID');
  assert.equal(overpaid.due, 0);
});

test('receipt numbering: format and next-in-sequence', () => {
  const issued = new Date('2026-09-29T10:00:00Z');
  assert.equal(formatReceiptNumber('REC', 123, issued), 'REC-2026-000123');
  assert.equal(nextReceiptNumber(0), 1);
  assert.equal(nextReceiptNumber(122), 123);
});

// ---------------------------------------------------------------------------
// Mutations against a fake prisma client
// ---------------------------------------------------------------------------

function makeFakeDb() {
  const receipts: any[] = [];
  const orders: any[] = [];
  const audit: any[] = [];
  let seq = 0;
  const nextId = (p: string) => `${p}_${++seq}`;

  const db: any = {
    receipt: {
      findFirst: async ({ where, orderBy }: any) => {
        let rows = receipts.filter((r) => r.userId === where.userId && r.series === where.series);
        if (orderBy?.number === 'desc') rows = rows.sort((a, b) => b.number - a.number);
        return rows[0] ?? null;
      },
    },
    order: {
      findFirst: async ({ where }: any) =>
        orders.find((o) => o.id === where.id && o.userId === where.userId) ??
        orders.find((o) => o.bookingId === where.bookingId && o.userId === where.userId) ??
        null,
      update: async ({ where, data }: any) => {
        const o = orders.find((x) => x.id === where.id);
        Object.assign(o, data);
        return o;
      },
    },
    tenantAuditLog: { create: async ({ data }: any) => void audit.push(data) },
    $transaction: async (fn: (tx: any) => any) => fn(db),
  };

  return {
    db,
    orders,
    receipts,
    audit,
    seedOrder(over: Partial<any> = {}) {
      const order: any = {
        id: nextId('ord'),
        userId: 'u1',
        bookingId: null,
        status: 'ISSUED',
        currency: 'eur',
        items: [{ quantity: 1, unitCents: 3000 }],
        payments: [],
        ...over,
      };
      orders.push(order);
      return order;
    },
  };
}

const actor = { id: 'u1', name: 'Owner' };

test('createOrder writes order, items, sequential receipt and audit', async () => {
  const { db, orders, receipts, audit } = makeFakeDb();
  let createSeq = 0;
  db.order.create = async ({ data }: any) => {
    const order = {
      id: `ord_create_${++createSeq}`,
      ...data,
      items: undefined,
      receipt: { number: data.receipt.create.number, series: 'REC' },
    };
    orders.push(order);
    receipts.push({ userId: data.userId, series: 'REC', number: data.receipt.create.number });
    return order;
  };

  const order = await createOrder(
    {
      userId: 'u1',
      currency: 'EUR',
      items: [{ description: 'Producto 1', unitCents: 1500 }],
      actor,
    },
    { prisma: db }
  );

  assert.equal(order.receipt.number, 1);
  assert.equal(orders.length, 1);
  assert.equal(audit.filter((a) => a.action === 'ORDER_CREATE').length, 1);
});

test('voidOrder blocks when money was effectively kept', async () => {
  const { db, seedOrder } = makeFakeDb();
  const order = seedOrder({
    payments: [{ status: 'COMPLETED', amountCents: 3000, refundCents: 0 }],
  });

  await assert.rejects(
    () => voidOrder(order.id, 'u1', 'duplicado', actor, { prisma: db }),
    (err: OrderError) => err.status === 409
  );
});

test('voidOrder succeeds when nothing effective was collected and audits it', async () => {
  const { db, audit, seedOrder } = makeFakeDb();
  const order = seedOrder({ payments: [{ status: 'ANNULLED', amountCents: 3000 }] });

  const updated = await voidOrder(order.id, 'u1', ' venta duplicada ', actor, { prisma: db });
  assert.equal(updated.status, 'VOID');
  assert.equal(updated.note, 'venta duplicada');
  assert.equal(audit.filter((a) => a.action === 'ORDER_VOID').length, 1);
});
