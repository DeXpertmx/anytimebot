/**
 * E2E smoke test: manual payments module flow against APP_URL (default:
 * production, same policy as e2e-free-booking).
 *
 * Flow under test (the module's happy path + its guards):
 *   1. Quick sale (no appointment): 2 lines, first CASH payment PARTIAL.
 *   2. Second payment (card) completes the order balance.
 *   3. Idempotency: repeating the same idempotencyKey does NOT charge twice.
 *   4. Booking payment: partial manual payment leaves the booking unpaid;
 *      the second payment + `complete: true` finalizes the appointment and
 *      syncs the legacy flat columns.
 *   5. Annulment: the payment row is kept with ANNULLED + reason and the
 *      balance goes back to PARTIAL (nothing is ever deleted).
 *   6. Arqueo: a dedicated test Location keeps the drawer math isolated —
 *      open (float 10.00) → expected = float + the sale's CASH movement →
 *      close with the exact count → difference 0 → the period is frozen
 *      (further movements → 409).
 *   7. Immutable audit: at least one TenantAuditLog row per touched entity.
 *
 * Authentication: mints a NextAuth JWT session cookie with the local
 * NEXTAUTH_SECRET (the same value Vercel uses) for the owner of a paid event
 * type found in the DB. lib/auth.ts re-hydrates role/plan from `sub`, so a
 * minimal payload is enough.
 *
 * Cleanup: hard-deletes every created row (booking, orders+payments, cash
 * session/movements, test location, audit rows of the test targets). The
 * booking is created directly in the DB on purpose: this test owns the
 * payment flow, not the booking flow (already covered by e2e-free-booking),
 * and going through the public API would drag Stripe checkout/email
 * side effects into the run. Booking payment steps use CARD_ONSITE so no
 * movement can ever reach a real open drawer; the CASH sale is scoped to the
 * dedicated test Location.
 *
 * Usage:
 *   npx tsx scripts/e2e-manual-payments.ts
 *   APP_URL=http://localhost:3000 npx tsx scripts/e2e-manual-payments.ts
 *
 * Exit code 0 = all steps passed; 1 = failure (with step label).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

const APP_URL = (process.env.APP_URL || 'https://anytimebot-src.vercel.app').replace(/\/$/, '');
const MARKER = 'e2e-prueba@anytimebot.app';
const NOTE_MARKER = 'e2e-manual-payments';

const prisma = new PrismaClient();

// Rows created by the run, removed by cleanup().
const ids = {
  orders: [] as string[],
  bookingId: null as string | null,
  locationId: null as string | null,
  auditTargets: [] as string[],
};

function fail(step: string, error: unknown): never {
  console.error(`\n✗ E2E FAILED at [${step}]:`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
  throw error;
}

async function cleanup(): Promise<void> {
  try {
    // Orders cascade to items, payments, applications and the receipt.
    for (const orderId of ids.orders) {
      await prisma.order.delete({ where: { id: orderId } }).catch(() => null);
    }
    if (ids.bookingId) {
      // The finalized booking emits an Invoice whose FK is SetNull — remove it
      // first, matched by bookingId, so no synthetic invoice row survives.
      await prisma.invoice.deleteMany({ where: { bookingId: ids.bookingId } }).catch(() => null);
      const booking = await prisma.booking.findUnique({ where: { id: ids.bookingId }, select: { seriesId: true } });
      await prisma.booking.delete({ where: { id: ids.bookingId } }).catch(() => null);
      if (booking?.seriesId) {
        const remaining = await prisma.booking.count({ where: { seriesId: booking.seriesId } });
        if (remaining === 0) await prisma.bookingSeries.delete({ where: { id: booking.seriesId } }).catch(() => null);
      }
    }
    if (ids.locationId) {
      // Sessions point at the location with SetNull → remove their rows first.
      const sessions = await prisma.cashSession.findMany({ where: { locationId: ids.locationId }, select: { id: true } });
      for (const s of sessions) {
        await prisma.cashMovement.deleteMany({ where: { sessionId: s.id } });
        await prisma.cashSession.delete({ where: { id: s.id } }).catch(() => null);
      }
      await prisma.location.delete({ where: { id: ids.locationId } }).catch(() => null);
    }
    // The audit log is append-only in real usage; these are synthetic rows for
    // entities that no longer exist, so they are removed with the rest.
    for (const targetId of ids.auditTargets) {
      await prisma.tenantAuditLog.deleteMany({ where: { targetId } });
    }
    console.log('✓ cleanup: orders, booking, cash session and test location deleted');
  } catch (e) {
    console.error('⚠ cleanup failed:', e instanceof Error ? e.message : e);
  }
}

async function main(): Promise<void> {
  console.log(`E2E manual payments → ${APP_URL}\n`);

  // ------------------------------------------------------------------
  // Step 0: tenant setup — owner of a paid event type + session cookie
  // ------------------------------------------------------------------
  const paidEvent = await prisma.eventType.findFirst({
    where: { collectPayment: true, price: { gt: 0 } },
    select: {
      id: true, name: true, price: true, currency: true, duration: true,
      bookingPage: { select: { userId: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const ownerId = paidEvent?.bookingPage.userId ?? (await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } }))?.id;
  if (!ownerId) fail('setup', new Error('no owner available in DB'));
  const owner = await prisma.user.findUnique({ where: { id: ownerId! }, select: { id: true, name: true, email: true, currency: true } });
  if (!owner) fail('setup', new Error('owner user not found'));
  console.log(`✓ setup: tenant ${owner!.email} (paid event: ${paidEvent ? paidEvent.name : '—'})`);

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) fail('setup', new Error('NEXTAUTH_SECRET missing in .env.local'));
  const cookieName = APP_URL.startsWith('https') ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  const jwt = await encode({
    secret: secret!,
    salt: cookieName,
    token: { sub: owner!.id, name: owner!.name, email: owner!.email },
  });
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${APP_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: `${cookieName}=${jwt}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as any;
    return { status: res.status, json };
  };
  console.log('✓ setup: session cookie minted');

  // A dedicated branch keeps the drawer math of this run isolated.
  const testLocation = await prisma.location.create({
    data: { userId: owner!.id, name: 'E2E Caja (auto)', isActive: true },
  });
  ids.locationId = testLocation.id;
  console.log(`✓ setup: test location "${testLocation.name}" created`);

  // ------------------------------------------------------------------
  // Step 1: quick sale with a PARTIAL first payment (cash)
  // ------------------------------------------------------------------
  const idemSale = `e2e-sale-${Date.now()}`;
  const sale = await api('POST', '/api/orders', {
    items: [
      { description: 'E2E producto', unitCents: 1500 },
      { description: 'E2E extra', quantity: 2, unitCents: 250 },
    ],
    locationId: testLocation.id,
    note: NOTE_MARKER,
    payment: { method: 'CASH', amountCents: 1500, idempotencyKey: idemSale },
  });
  if (sale.status !== 201 || !sale.json?.success) fail('quick-sale', new Error(`HTTP ${sale.status}: ${sale.json?.error}`));
  const orderId: string = sale.json.data.order.id;
  ids.orders.push(orderId);
  ids.auditTargets.push(orderId);
  const balance1 = sale.json.data.balance;
  if (balance1.total !== 2000) fail('quick-sale', new Error(`total ${balance1.total} != 2000`));
  if (balance1.paid !== 1500 || balance1.state !== 'PARTIAL' || balance1.due !== 500) {
    fail('quick-sale', new Error(`balance after partial: ${JSON.stringify(balance1)}`));
  }
  const receiptNumber: number | null = sale.json.data.order.receipt?.number ?? null;
  if (!receiptNumber || receiptNumber < 1) fail('quick-sale', new Error('sequential receipt number missing'));
  console.log(`✓ quick-sale: order ${orderId} · total 20.00 · cash 15.00 → PARTIAL (due 5.00), receipt #${receiptNumber}`);

  // ------------------------------------------------------------------
  // Step 2: second payment completes the order
  // ------------------------------------------------------------------
  const idemCard = `e2e-card-${Date.now()}`;
  const second = await api('POST', `/api/orders/${orderId}/payments`, {
    method: 'CARD_ONSITE', amountCents: 500, idempotencyKey: idemCard,
  });
  if (second.status !== 200 || !second.json?.success) fail('complete-payment', new Error(`HTTP ${second.status}: ${second.json?.error}`));
  if (second.json.data.balance.state !== 'PAID' || second.json.data.balance.due !== 0) {
    fail('complete-payment', new Error(`balance after card: ${JSON.stringify(second.json.data.balance)}`));
  }
  const cardPaymentId: string = second.json.data.payment.id;
  ids.auditTargets.push(cardPaymentId);
  console.log('✓ complete-payment: card 5.00 → order PAID');

  // ------------------------------------------------------------------
  // Step 3: idempotency — the same key must NOT charge twice
  // ------------------------------------------------------------------
  const replay = await api('POST', `/api/orders/${orderId}/payments`, {
    method: 'CARD_ONSITE', amountCents: 500, idempotencyKey: idemCard,
  });
  if (replay.status !== 200 || !replay.json?.success) fail('idempotency', new Error(`HTTP ${replay.status}: ${replay.json?.error}`));
  if (replay.json.data.idempotentReplay !== true) fail('idempotency', new Error('replay flag not set'));
  const detailAfterReplay = await api('GET', `/api/orders/${orderId}`);
  const paymentCount: number = detailAfterReplay.json.data.payments.length;
  if (paymentCount !== 2) fail('idempotency', new Error(`payments count ${paymentCount} != 2 after replay`));
  console.log(`✓ idempotency: replay returned the original payment (still ${paymentCount} payments)`);

  // ------------------------------------------------------------------
  // Step 4: booking payment — partial, then complete + finalize
  // ------------------------------------------------------------------
  if (!paidEvent) {
    console.log('⚠ booking-payment: no paid event type in DB — step skipped');
  } else {
    const booking = await prisma.booking.create({
      data: {
        eventTypeId: paidEvent.id,
        guestName: 'Prueba E2E Pagos',
        guestEmail: MARKER,
        startTime: new Date(Date.now() + 48 * 3600 * 1000),
        endTime: new Date(Date.now() + 48 * 3600 * 1000 + paidEvent.duration * 60000),
        timezone: 'Europe/Madrid',
        status: 'CONFIRMED',
      },
    });
    ids.bookingId = booking.id;
    const price = paidEvent.price; // cents

    const partial = await api('POST', `/api/bookings/${booking.id}/payments`, {
      method: 'CARD_ONSITE', amountCents: Math.floor(price / 2), idempotencyKey: `e2e-b1-${Date.now()}`,
    });
    if (partial.status !== 200 || !partial.json?.success) fail('booking-payment', new Error(`HTTP ${partial.status}: ${partial.json?.error}`));
    if (partial.json.data.balance.state !== 'PARTIAL') fail('booking-payment', new Error('partial payment did not leave a due balance'));
    let storedAfterPartial = await prisma.booking.findUnique({ where: { id: booking.id }, select: { paymentStatus: true } });
    if (storedAfterPartial?.paymentStatus !== null) fail('booking-payment', new Error(`legacy paymentStatus should stay null while PARTIAL (got ${storedAfterPartial?.paymentStatus})`));

    const rest = await api('POST', `/api/bookings/${booking.id}/payments`, {
      method: 'TRANSFER', amountCents: price - Math.floor(price / 2), complete: true, idempotencyKey: `e2e-b2-${Date.now()}`,
    });
    if (rest.status !== 200 || !rest.json?.success) fail('booking-payment', new Error(`HTTP ${rest.status}: ${rest.json?.error}`));
    if (rest.json.data.balance.state !== 'PAID') fail('booking-payment', new Error('balance not PAID after second payment'));
    if (rest.json.data.completed !== true) fail('booking-payment', new Error(`finalize failed: ${rest.json.data.finalizeWarning || 'no warning'}`));
    const storedAfterFinal = await prisma.booking.findUnique({ where: { id: booking.id }, select: { paymentStatus: true, status: true, paymentAmount: true } });
    if (storedAfterFinal?.paymentStatus !== 'PAID' || storedAfterFinal?.status !== 'COMPLETED' || storedAfterFinal?.paymentAmount !== price) {
      fail('booking-payment', new Error(`legacy sync wrong: ${JSON.stringify(storedAfterFinal)}`));
    }
    const bookingOrderId: string = rest.json.data.order.id;
    ids.orders.push(bookingOrderId);
    ids.auditTargets.push(bookingOrderId);
    console.log(`✓ booking-payment: partial ${Math.floor(price / 2)} + ${price - Math.floor(price / 2)} → PAID, appointment COMPLETED, legacy columns synced`);

    // ----------------------------------------------------------------
    // Step 5: annulment — the row survives with its reason
    // ----------------------------------------------------------------
    const transferPayment = (rest.json.data.order.payments as any[]).find((p) => p.method === 'TRANSFER' && p.status === 'COMPLETED');
    if (!transferPayment) fail('annul', new Error('TRANSFER payment not found on the booking order'));
    ids.auditTargets.push(transferPayment.id);
    const annulled = await api('POST', `/api/payments/${transferPayment.id}`, {
      action: 'annul', reason: 'Cobro de prueba E2E anulado',
    });
    if (annulled.status !== 200 || !annulled.json?.success) fail('annul', new Error(`HTTP ${annulled.status}: ${annulled.json?.error}`));
    if (annulled.json.data.status !== 'ANNULLED' || !annulled.json.data.annulledReason) fail('annul', new Error('payment not ANNULLED with reason'));

    const afterAnnul = await api('GET', `/api/orders/${bookingOrderId}`);
    const kept = (afterAnnul.json.data.payments as any[]).find((p) => p.id === transferPayment.id);
    if (!kept) fail('annul', new Error('annulled payment row was deleted (must be kept)'));
    if (afterAnnul.json.data.balance.state !== 'PARTIAL') fail('annul', new Error(`balance after annul: ${JSON.stringify(afterAnnul.json.data.balance)}`));
    console.log('✓ annul: payment kept as ANNULLED with reason · balance back to PARTIAL');
  }

  // ------------------------------------------------------------------
  // Step 6: arqueo on the dedicated drawer — open, expected, close, freeze
  // ------------------------------------------------------------------
  const open = await api('POST', '/api/cash-sessions', { openingCents: 1000, locationId: testLocation.id });
  if (open.status !== 201 || !open.json?.success) fail('cash-open', new Error(`HTTP ${open.status}: ${open.json?.error}`));
  const sessionId: string = open.json.data.id;
  ids.auditTargets.push(sessionId);

  const current = await api('GET', `/api/cash-sessions?locationId=${testLocation.id}`);
  const flow = current.json?.data?.current?.flow;
  if (!flow || flow.expectedCents !== 2500) {
    fail('cash-arqueo', new Error(`expected drawer 2500 (float 1000 + cash sale 1500), got ${JSON.stringify(flow)}`));
  }
  console.log('✓ cash-arqueo: open drawer · expected 25.00 = float 10.00 + cash sale 15.00');

  const closed = await api('POST', `/api/cash-sessions/${sessionId}/close`, { countedCents: 2500 });
  if (closed.status !== 200 || !closed.json?.success) fail('cash-arqueo', new Error(`HTTP ${closed.status}: ${closed.json?.error}`));
  const summary = closed.json.data.summary;
  if (summary.expectedCents !== 2500 || summary.differenceCents !== 0) {
    fail('cash-arqueo', new Error(`arqueo summary: ${JSON.stringify(summary)}`));
  }
  if ((summary.byMethod?.CASH ?? 0) !== 1500) fail('cash-arqueo', new Error(`per-method CASH total ${summary.byMethod?.CASH} != 1500`));
  console.log('✓ cash-arqueo: counted 25.00 → difference 0 · CASH sales 15.00');

  const frozen = await api('POST', `/api/cash-sessions/${sessionId}/movements`, {
    type: 'DEPOSIT', direction: 'IN', amountCents: 100, concept: 'después del cierre',
  });
  if (frozen.status !== 409) fail('cash-freeze', new Error(`closed session accepted a movement (HTTP ${frozen.status})`));
  console.log('✓ cash-freeze: movement on the closed period rejected with 409');

  // ------------------------------------------------------------------
  // Step 7: immutable audit trail
  // ------------------------------------------------------------------
  const auditCount = await prisma.tenantAuditLog.count({
    where: { userId: owner!.id, targetId: { in: ids.auditTargets }, action: { in: ['ORDER_CREATE', 'PAYMENT_ADD', 'PAYMENT_ANNUL', 'CASH_OPEN', 'CASH_CLOSE'] } },
  });
  if (auditCount < 5) fail('audit', new Error(`expected ≥5 audit rows for the run, found ${auditCount}`));
  console.log(`✓ audit: ${auditCount} immutable rows (ORDER_CREATE/PAYMENT_ADD/PAYMENT_ANNUL/CASH_OPEN/CASH_CLOSE)`);

  await cleanup();
  console.log('\n✓ E2E PASSED — manual payments flow works end to end');
}

main()
  .catch(() => (process.exitCode = 1))
  .finally(async () => {
    if (process.exitCode === 1) await cleanup();
    await prisma.$disconnect();
  });
