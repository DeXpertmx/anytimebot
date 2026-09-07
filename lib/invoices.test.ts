/**
 * Tests for lib/invoices.ts (node:test + tsx).
 *
 * Uses the project's dependency-injection pattern (same as lib/webhooks.test.ts
 * and lib/volkern.test.ts): a fake prisma client is passed into every call —
 * no module mocking, no database, no sleeps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ensureInvoiceForCompletedBooking,
  cancelInvoiceForBooking,
  buildInvoiceLineItems,
  type InvoiceDeps,
} from './invoices';

// ---------------------------------------------------------------------------
// Fake prisma client (invoice + booking models only)
// ---------------------------------------------------------------------------

interface FakeInvoice {
  id: string;
  userId: string;
  bookingId: string | null;
  number: string;
  status: string;
  issueDate: Date;
  serviceDate: Date;
  currency: string;
  totalAmount: number;
  vatRate: number;
  vatAmount: number;
  items: unknown;
  issuerName: string | null;
  issuerCompany: string | null;
  issuerAddress: string | null;
  issuerCountry: string | null;
  issuerVatId: string | null;
  issuerEmail: string | null;
  guestName: string;
  guestEmail: string;
}

function makeFakeDb() {
  const bookings: any[] = [];
  const invoices: FakeInvoice[] = [];
  let seq = 0;
  const nextId = () => `inv_${++seq}`;

  const db: any = {
    booking: {
      findUnique: async ({ where }: any) =>
        bookings.find((b) => b.id === where.id) ?? null,
    },
    invoice: {
      findUnique: async ({ where }: any) =>
        where.id
          ? invoices.find((i) => i.id === where.id) ?? null
          : invoices.find((i) => i.bookingId === where.bookingId) ?? null,
      findMany: async ({ where, select }: any = {}) =>
        invoices
          .filter((i) => {
            if (where?.userId && i.userId !== where.userId) return false;
            if (where?.number?.startsWith && !i.number.startsWith(where.number.startsWith)) {
              return false;
            }
            return true;
          })
          .map((i) => {
            if (select) {
              const out: Record<string, unknown> = {};
              for (const key of Object.keys(select)) out[key] = (i as any)[key];
              return out;
            }
            return i;
          }),
      create: async ({ data }: any) => {
        const rec: FakeInvoice = {
          id: nextId(),
          userId: data.userId,
          bookingId: data.bookingId ?? null,
          number: data.number,
          status: data.status ?? 'ISSUED',
          issueDate: data.issueDate ?? new Date(),
          serviceDate: data.serviceDate,
          currency: data.currency ?? 'EUR',
          totalAmount: data.totalAmount,
          vatRate: data.vatRate ?? 0,
          vatAmount: data.vatAmount ?? 0,
          items: data.items,
          issuerName: data.issuerName ?? null,
          issuerCompany: data.issuerCompany ?? null,
          issuerAddress: data.issuerAddress ?? null,
          issuerCountry: data.issuerCountry ?? null,
          issuerVatId: data.issuerVatId ?? null,
          issuerEmail: data.issuerEmail ?? null,
          guestName: data.guestName,
          guestEmail: data.guestEmail,
        };
        if (invoices.some((i) => i.userId === rec.userId && i.number === rec.number)) {
          const err: any = new Error('Unique constraint');
          err.code = 'P2002';
          throw err;
        }
        invoices.push(rec);
        return { ...rec };
      },
      update: async ({ where, data }: any) => {
        const rec = invoices.find((i) => i.id === where.id);
        if (!rec) throw new Error('invoice not found');
        Object.assign(rec, data);
        return { ...rec };
      },
    },
  };

  return {
    db,
    bookings,
    invoices,
    seedBooking(overrides: Record<string, unknown> = {}) {
      const booking: any = {
        id: `bk_${bookings.length + 1}`,
        guestName: 'María Pérez',
        guestEmail: 'maria@example.com',
        startTime: new Date('2026-09-10T09:00:00Z'),
        paymentAmount: 2500,
        paymentCurrency: 'eur',
        paymentStatus: 'PAID',
        status: 'COMPLETED',
        serviceItems: null,
        eventType: {
          id: 'et_1',
          name: 'Consulta',
          duration: 30,
          bookingPage: {
            id: 'bp_1',
            userId: 'user_1',
            user: {
              id: 'user_1',
              name: 'Barbería López',
              email: 'hola@barberialopez.com',
              company: 'Barbería López S.L.',
              address: 'Calle Mayor 1, Madrid',
              country: 'ES',
            },
          },
        },
        ...overrides,
      };
      bookings.push(booking);
      return booking;
    },
  };
}

function makeDeps(): { deps: InvoiceDeps } & ReturnType<typeof makeFakeDb> {
  const fake = makeFakeDb();
  return { ...fake, deps: { prisma: fake.db as any } };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('issues an invoice for a paid + completed booking (single service)', async () => {
  const ctx = makeDeps();
  ctx.seedBooking();

  const invoice = await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);

  assert.ok(invoice, 'invoice must be created');
  assert.match(invoice.number, /^INV-\d{4}-0001$/);
  assert.equal(invoice.status, 'ISSUED');
  assert.equal(invoice.bookingId, 'bk_1');
  assert.equal(invoice.userId, 'user_1');
  assert.equal(invoice.totalAmount, 2500);
  assert.equal(invoice.currency, 'EUR');
  assert.equal(invoice.guestName, 'María Pérez');
  assert.equal(invoice.guestEmail, 'maria@example.com');
  // Issuer snapshot
  assert.equal(invoice.issuerCompany, 'Barbería López S.L.');
  assert.equal(invoice.issuerAddress, 'Calle Mayor 1, Madrid');
  assert.equal(invoice.issuerEmail, 'hola@barberialopez.com');
  // Single line item for the event type
  assert.equal(invoice.items.length, 1);
  assert.equal(invoice.items[0].name, 'Consulta');
  assert.equal(invoice.items[0].totalCents, 2500);
  assert.equal(ctx.invoices.length, 1);
});

test('multi-service bookings produce one line per paid service', async () => {
  const ctx = makeDeps();
  ctx.seedBooking({
    serviceItems: [
      { eventTypeId: 'et_1', name: 'Corte de cabello', duration: 30, price: 2000, currency: 'eur', collectPayment: true },
      { eventTypeId: 'et_2', name: 'Barba', duration: 20, price: 1000, currency: 'eur', collectPayment: true },
    ],
    paymentAmount: 3000,
  });

  const invoice = await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);

  assert.ok(invoice);
  assert.equal(invoice.items.length, 2);
  assert.deepEqual(invoice.items.map((i: any) => i.name), ['Corte de cabello', 'Barba']);
  assert.equal(invoice.items[0].totalCents, 2000);
  assert.equal(invoice.items[1].totalCents, 1000);
  assert.equal(invoice.totalAmount, 3000);
});

test('does not issue an invoice for a booking that is not paid', async () => {
  const ctx = makeDeps();
  ctx.seedBooking({ paymentStatus: null, paymentAmount: null });

  const invoice = await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);

  assert.equal(invoice, null);
  assert.equal(ctx.invoices.length, 0);
});

test('does not issue an invoice until the booking is COMPLETED', async () => {
  const ctx = makeDeps();
  ctx.seedBooking({ status: 'CONFIRMED' });

  const invoice = await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);

  assert.equal(invoice, null);
  assert.equal(ctx.invoices.length, 0);
});

test('is idempotent: a booking only ever gets one invoice', async () => {
  const ctx = makeDeps();
  ctx.seedBooking();

  const first = await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);
  const second = await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);

  assert.ok(first);
  assert.equal(second.id, first.id);
  assert.equal(ctx.invoices.length, 1);
});

test('invoices are numbered sequentially per owner', async () => {
  const ctx = makeDeps();
  ctx.seedBooking();
  ctx.seedBooking({ id: 'bk_2' });

  const first = await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);
  const second = await ensureInvoiceForCompletedBooking('bk_2', ctx.deps);

  assert.match(first.number, /^INV-\d{4}-0001$/);
  assert.match(second.number, /^INV-\d{4}-0002$/);
});

test('returns null for an unknown booking', async () => {
  const ctx = makeDeps();
  const invoice = await ensureInvoiceForCompletedBooking('does-not-exist', ctx.deps);
  assert.equal(invoice, null);
});

test('returns null for bookings without a charge', async () => {
  const ctx = makeDeps();
  ctx.seedBooking({ paymentAmount: 0 });
  const invoice = await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);
  assert.equal(invoice, null);
});

test('never throws when the database fails', async () => {
  const ctx = makeDeps();
  ctx.seedBooking();
  const original = ctx.db.invoice.findUnique;
  ctx.db.invoice.findUnique = async () => {
    throw new Error('db down');
  };
  try {
    await assert.doesNotReject(() => ensureInvoiceForCompletedBooking('bk_1', ctx.deps));
  } finally {
    ctx.db.invoice.findUnique = original;
  }
});

test('cancel marks an existing invoice as CANCELLED', async () => {
  const ctx = makeDeps();
  ctx.seedBooking();
  await ensureInvoiceForCompletedBooking('bk_1', ctx.deps);

  const cancelled = await cancelInvoiceForBooking('bk_1', ctx.deps);

  assert.ok(cancelled);
  assert.equal(cancelled.status, 'CANCELLED');
});

test('cancel is a no-op when no invoice exists yet', async () => {
  const ctx = makeDeps();
  ctx.seedBooking();
  const result = await cancelInvoiceForBooking('bk_1', ctx.deps);
  assert.equal(result, null);
  assert.equal(ctx.invoices.length, 0);
});

test('buildInvoiceLineItems falls back to the primary event when unpaid extras', () => {
  const booking: any = {
    startTime: new Date('2026-09-10T09:00:00Z'),
    paymentAmount: 2500,
    serviceItems: [
      { eventTypeId: 'et_1', name: 'Corte', duration: 30, price: 2000, currency: 'eur', collectPayment: true },
      { eventTypeId: 'et_2', name: 'Asesoría gratis', duration: 10, price: 0, currency: 'eur', collectPayment: false },
    ],
    eventType: { name: 'Corte', duration: 30 },
  };
  const items = buildInvoiceLineItems(booking);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Corte');
  assert.equal(items[0].totalCents, 2000);
});
