/**
 * Post-deploy smoke test for PRODUCTION.
 *
 * Exercises the three critical flows end to end and cleans up after itself:
 *
 *   1. LOGIN      — creates a throwaway user via /api/signup (with a unique
 *                   timestamped email), then logs in via NextAuth credentials
 *                   callback and hits /api/auth/session with the returned
 *                   cookies. This validates signup + password check + session
 *                   cookie issuance on the live deployment.
 *   2. BOOKING    — free booking: availability → POST /api/bookings with the
 *                   public form's multi-service payload shape → booking exists
 *                   in the DB with the right primary event type. (Same as
 *                   scripts/e2e-free-booking.ts, inlined here so the smoke
 *                   run is self-contained.)
 *   3. PAYMENT    — paid event: POST /api/bookings/create-payment must return
 *                   a Stripe Checkout URL (session created). The Stripe mode
 *                   (test vs live) is whatever the admin has configured — in
 *                   test mode this creates a harmless test-mode session; the
 *                   test NEVER completes the payment, and the checkout
 *                   session is cancelled during cleanup so it can't be paid
 *                   by accident. No booking row is created by this step
 *                   (that happens in the Stripe webhook only).
 *   4. CLEANUP    — deletes the booking, the smoke user (+ its auth/
 *                   session/account rows) and cancels the Stripe session.
 *
 * Usage:
 *   npm run smoke                       # → https://anytimebot.app
 *   APP_URL=http://localhost:3000 npm run smoke
 *
 * Requires .env.local with the production DATABASE_URL (read/write, for
 * cleanup and verification).
 * Exit 0 = all flows passed; 1 = a flow failed (marked with ✗).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const APP_URL = (process.env.APP_URL || 'https://anytimebot.app').replace(/\/$/, '');
const RUN_TAG = `smoke-${Date.now()}`;
const BOOKING_EMAIL = `${RUN_TAG}@anytimebot.app`;
const LOGIN_EMAIL = `${RUN_TAG}-login@anytimebot.app`;
const LOGIN_PASSWORD = `Sm0ke!${crypto.randomBytes(6).toString('hex')}`;

const prisma = new PrismaClient();
const created: {
  bookingIds: string[];
  userIds: string[];
  stripeSessionIds: string[];
} = { bookingIds: [], userIds: [], stripeSessionIds: [] };

function ok(step: string, msg: string): void {
  console.log(`✓ [${step}] ${msg}`);
}

function fail(step: string, error: unknown): never {
  console.error(`✗ [${step}] FAILED:`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
  throw error instanceof Error ? error : new Error(String(error));
}

async function cleanup(): Promise<void> {
  // Cancel any Stripe checkout session created by the payment probe so it
  // can never be completed later (test or live — expiry() is idempotent).
  for (const sessionId of created.stripeSessionIds) {
    try {
      const { getStripe } = await import('../lib/stripe');
      const { getStripeMode } = await import('../lib/stripe-mode');
      const client = await getStripe(await getStripeMode());
      await client.checkout.sessions.expire(sessionId).catch(() => null);
    } catch {
      // best-effort
    }
  }
  for (const id of created.bookingIds) {
    await prisma.booking.delete({ where: { id } }).catch(() => null);
  }
  for (const id of created.userIds) {
    // NextAuth PrismaAdapter rows (accounts/sessions) cascade via userId FK.
    await prisma.session.deleteMany({ where: { userId: id } });
    await prisma.account.deleteMany({ where: { userId: id } });
    await prisma.user.delete({ where: { id } }).catch(() => null);
  }
  if (created.bookingIds.length || created.userIds.length || created.stripeSessionIds.length) {
    console.log('✓ [cleanup] test data removed');
  }
}

// ---------------------------------------------------------------------------
// Flow 1: LOGIN (signup → credentials login → session)
// ---------------------------------------------------------------------------
async function smokeLogin(): Promise<void> {
  const signupRes = await fetch(`${APP_URL}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Login', email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
  });
  const signup = (await signupRes.json()) as { success: boolean; error?: string; data?: { id: string } };
  if (!signupRes.ok || !signup.success || !signup.data?.id) {
    fail('login/signup', new Error(`HTTP ${signupRes.status}: ${signup.error || 'no id'}`));
  }
  created.userIds.push(signup.data.id);
  ok('login/signup', `user ${LOGIN_EMAIL} created`);

  // NextAuth credentials login: needs CSRF token + form-encoded callback.
  const csrfRes = await fetch(`${APP_URL}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookie = (csrfRes.headers.get('set-cookie') || '')
    .split(';')[0]
    .split(', ')
    .map((c) => c.trim())
    .filter((c) => /csrf-token=/.test(c))
    .map((c) => c.split('=')[0] + '=' + decodeURIComponent((c.split('=').slice(1).join('='))))
    .join('; ');

  const loginRes = await fetch(`${APP_URL}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: csrfCookie,
    },
    body: new URLSearchParams({
      csrfToken,
      email: LOGIN_EMAIL,
      password: LOGIN_PASSWORD,
      callbackUrl: `${APP_URL}/dashboard`,
      json: 'true',
    }),
    redirect: 'manual',
  });

  const setCookies = (loginRes.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]);
  const sessionCookie = setCookies.find((c) => /session-token=/.test(c));
  if (!sessionCookie) {
    fail('login/callback', new Error(`no session cookie issued (HTTP ${loginRes.status})`));
  }
  ok('login/callback', `session cookie issued (HTTP ${loginRes.status})`);

  const sessionRes = await fetch(`${APP_URL}/api/auth/session`, {
    headers: { Cookie: sessionCookie },
  });
  const session = (await sessionRes.json()) as { user?: { email?: string } };
  if (session?.user?.email !== LOGIN_EMAIL) {
    fail('login/session', new Error(`session email mismatch: ${JSON.stringify(session).slice(0, 120)}`));
  }
  ok('login/session', `session valid for ${session.user.email}`);
}

// ---------------------------------------------------------------------------
// Flow 2: BOOKING (free, public form payload shape)
// ---------------------------------------------------------------------------
async function smokeBooking(): Promise<void> {
  const eventType = await prisma.eventType.findFirst({
    where: { price: 0, collectPayment: false },
    select: { id: true, name: true, duration: true, bufferTime: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!eventType) fail('booking/setup', new Error('no free event type in DB'));

  let date = '';
  let slot = '';
  for (let offset = 1; offset <= 7 && !slot; offset++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    date = d.toISOString().slice(0, 10);
    const res = (await fetch(`${APP_URL}/api/bookings/check-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventTypeIds: [eventType.id], date, timezone: 'Europe/Madrid' }),
    }).then((r) => r.json())) as { availableSlots?: string[] };
    if ((res.availableSlots || []).length > 0) {
      const slots = res.availableSlots!;
      slot = slots[Math.floor(slots.length / 2)];
    }
  }
  if (!slot) fail('booking/availability', new Error('no slots in the next 7 weekdays'));
  ok('booking/availability', `${date} ${slot}`);

  // Madrid wall-time → UTC instant
  const asUTC = new Date(`${date}T${slot}:00Z`);
  const asMadrid = new Date(asUTC.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const startTime = new Date(asUTC.getTime() + (asUTC.getTime() - asMadrid.getTime()));
  const endTime = new Date(startTime.getTime() + (eventType.duration + eventType.bufferTime) * 60000);

  const res = await fetch(`${APP_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventTypeIds: [eventType.id],
      guestName: 'Smoke Booking',
      guestEmail: BOOKING_EMAIL,
      guestPhone: null,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      timezone: 'Europe/Madrid',
      locationId: null,
      formData: { guestName: 'Smoke Booking', guestEmail: BOOKING_EMAIL, guestPhone: '', guestCountry: 'ES' },
    }),
  });
  const createdBooking = (await res.json()) as { success: boolean; error?: string; data?: { id?: string } };
  if (!res.ok || !createdBooking.success || !createdBooking.data?.id) {
    fail('booking/create', new Error(`HTTP ${res.status}: ${createdBooking.error || 'no id'}`));
  }
  const bookingId = createdBooking.data.id;
  created.bookingIds.push(bookingId);
  ok('booking/create', `booking ${bookingId}`);

  const stored = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { eventTypeId: true, status: true, startTime: true },
  });
  if (!stored) fail('booking/verify', new Error('not in DB'));
  if (stored.eventTypeId !== eventType.id) fail('booking/verify', new Error('wrong primary eventTypeId'));
  const drift = Math.abs(new Date(stored.startTime).getTime() - startTime.getTime());
  if (drift > 60_000) fail('booking/verify', new Error(`startTime drift ${Math.round(drift / 1000)}s`));
  ok('booking/verify', `status ${stored.status}, eventTypeId OK, drift ≤1 min`);
}

// ---------------------------------------------------------------------------
// Flow 3: PAYMENT (checkout session creation, never completed)
// ---------------------------------------------------------------------------
async function smokePayment(): Promise<void> {
  // Prefer the permanent smoke event (scripts/setup-stripe-test-and-smoke-event.ts)
  // so the flow stays deterministic once real paid events exist.
  const eventType =
    (await prisma.eventType.findFirst({
      where: { name: 'Smoke Test Event', collectPayment: true, price: { gt: 0 } },
      select: { id: true, name: true, price: true },
    })) ??
    (await prisma.eventType.findFirst({
      where: { price: { gt: 0 }, collectPayment: true },
      select: { id: true, name: true, price: true },
      orderBy: { createdAt: 'asc' },
    }));
  if (!eventType) {
    console.log('- [payment] skipped: no paid event type configured');
    return;
  }

  let date = '';
  let slot = '';
  for (let offset = 1; offset <= 7 && !slot; offset++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    date = d.toISOString().slice(0, 10);
    const res = (await fetch(`${APP_URL}/api/bookings/check-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventTypeIds: [eventType.id], date, timezone: 'Europe/Madrid' }),
    }).then((r) => r.json())) as { availableSlots?: string[] };
    if ((res.availableSlots || []).length > 0) {
      const slots = res.availableSlots!;
      slot = slots[Math.floor(slots.length / 2)];
    }
  }
  if (!slot) fail('payment/availability', new Error('no slots for the paid event'));

  const asUTC = new Date(`${date}T${slot}:00Z`);
  const asMadrid = new Date(asUTC.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
  const startTime = new Date(asUTC.getTime() + (asUTC.getTime() - asMadrid.getTime()));

  const res = await fetch(`${APP_URL}/api/bookings/create-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventTypeIds: [eventType.id],
      guestName: 'Smoke Payment',
      guestEmail: BOOKING_EMAIL,
      startTime: startTime.toISOString(),
      timezone: 'Europe/Madrid',
      locationId: null,
    }),
  });
  const payment = (await res.json()) as {
    success: boolean; error?: string; data?: { sessionId?: string; url?: string; fullyCovered?: boolean };
  };
  if (!res.ok || !payment.success) {
    fail('payment/create', new Error(`HTTP ${res.status}: ${payment.error || 'no session'}`));
  }
  if (!payment.data?.url || !payment.data.sessionId) {
    fail('payment/create', new Error('missing checkout url/sessionId'));
  }
  created.stripeSessionIds.push(payment.data.sessionId);
  const sessionMode = payment.data.sessionId.startsWith('cs_test_') ? 'test'
    : payment.data.sessionId.startsWith('cs_live_') ? 'live'
    : 'unknown';

  // Expected mode: EXPECT_STRIPE_MODE env var (defaults to 'test' — the smoke
  // should never be able to touch real money by accident).
  const expectedMode = (process.env.EXPECT_STRIPE_MODE || 'test') as 'test' | 'live';
  if (sessionMode !== expectedMode) {
    fail(
      'payment/mode',
      new Error(
        `Stripe mode mismatch: checkout session is ${sessionMode.toUpperCase()} but expected ${expectedMode.toUpperCase()}. `
        + (expectedMode === 'test'
          ? 'Refusing to touch live payments — switch the mode in Admin → Stripe (or run with EXPECT_STRIPE_MODE=live to override).'
          : 'Expected live but got a test session — check the active mode in Admin → Stripe.'),
      ),
    );
  }
  if (sessionMode === 'live') {
    // Allowed only via explicit EXPECT_STRIPE_MODE=live. Session is expired
    // immediately during cleanup and never completed.
    console.log('⚠ [payment] Stripe is in LIVE mode — session created and expired immediately, never completed');
  }
  ok('payment/mode', `checkout session mode: ${sessionMode} (expected ${expectedMode})`);
  ok('payment/create', `checkout session ${payment.data.sessionId.slice(0, 24)}… (not completed)`);
}

async function main(): Promise<void> {
  console.log(`Post-deploy smoke → ${APP_URL}\n`);
  await smokeLogin();
  console.log();
  await smokeBooking();
  console.log();
  await smokePayment();
  console.log('\n✓ SMOKE PASSED — login, booking and payment flows OK');
}

main()
  .catch(() => process.exitCode = 1)
  .finally(async () => {
    if (process.exitCode === 1) console.error('\n(run smoke cleanup…)');
    await cleanup();
    await prisma.$disconnect();
  });
