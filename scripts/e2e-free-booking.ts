/**
 * E2E smoke test: free booking against PRODUCTION.
 *
 * Simulates exactly what the public booking page does:
 *   1. POST /api/bookings/check-availability  → picks the first slot
 *   2. POST /api/bookings                     → creates the booking
 *      (payload shape identical to components/public/booking-form.tsx:
 *      multi-service `eventTypeIds` array, not the singular field)
 *   3. GET  /api/bookings (with an admin session) → verifies the booking
 *      actually appears in the owner's calendar feed
 *   4. Cleans up: hard-deletes the booking directly in the DB (the public
 *      cancel endpoint is soft-delete and would send emails/WhatsApp).
 *
 * Usage:
 *   npm run test:e2e                       # uses APP_URL=https://anytimebot.app
 *   APP_URL=http://localhost:3000 npm run test:e2e
 *
 * Requires .env.local with production DATABASE_URL + NEXTAUTH_SECRET (the
 * same values Vercel uses) to mint a session cookie and to clean up.
 * Exit code 0 = all steps passed; 1 = failure (with step label).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';

const APP_URL = (process.env.APP_URL || 'https://anytimebot.app').replace(/\/$/, '');
const MARKER = 'e2e-prueba@anytimebot.app';

const prisma = new PrismaClient();
let bookingId: string | null = null;

function fail(step: string, error: unknown): never {
  console.error(`\n✗ E2E FAILED at [${step}]:`, error instanceof Error ? error.message : error);
  process.exitCode = 1;
  throw error;
}

async function cleanup(): Promise<void> {
  if (!bookingId) return;
  try {
    // Hard delete, silently. Also remove a possible series container row if
    // the booking was the only member (defensive; free flow creates none).
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { seriesId: true } });
    await prisma.booking.delete({ where: { id: bookingId } }).catch(() => null);
    if (booking?.seriesId) {
      const remaining = await prisma.booking.count({ where: { seriesId: booking.seriesId } });
      if (remaining === 0) await prisma.bookingSeries.delete({ where: { id: booking.seriesId } }).catch(() => null);
    }
    console.log('✓ cleanup: test booking deleted');
  } catch (e) {
    console.error('⚠ cleanup failed (booking id ' + bookingId + '):', e instanceof Error ? e.message : e);
  }
}

async function main(): Promise<void> {
  console.log(`E2E free booking → ${APP_URL}\n`);

  // ------------------------------------------------------------------
  // Step 0: pick a free event type straight from the DB (source of truth)
  // ------------------------------------------------------------------
  const eventType = await prisma.eventType.findFirst({
    where: { price: 0, collectPayment: false },
    select: { id: true, name: true, duration: true, bufferTime: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!eventType) fail('setup', new Error('no free event type found in DB'));
  console.log(`✓ setup: event type "${eventType.name}" (${eventType.duration} min)`);

  // ------------------------------------------------------------------
  // Step 1: availability — find the next weekday with slots
  // ------------------------------------------------------------------
  let date = '';
  let slot = '';
  for (let offset = 1; offset <= 7 && !slot; offset++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue; // skip weekends
    date = d.toISOString().slice(0, 10);
    const res = await fetch(`${APP_URL}/api/bookings/check-availability`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventTypeIds: [eventType.id], date, timezone: 'Europe/Madrid' }),
    }).then((r) => r.json() as Promise<{ availableSlots?: string[] }>).catch(() => null);
    const slots = res?.availableSlots ?? [];
    if (slots.length > 0) slot = slots[Math.floor(slots.length / 2)]; // middle slot, not edge
  }
  if (!slot) fail('availability', new Error('no available slots in the next 7 weekdays'));
  console.log(`✓ availability: ${date} ${slot} (${date} is a weekday with open slots)`);

  // Slot time is local (Europe/Madrid) wall time → convert to the UTC instant
  // the server would store for that wall time on that date.
  function utcInstant(day: string, hhmm: string): Date {
    // Interpret hhmm in Madrid, then measure its offset from UTC on that date.
    const asUTC = new Date(`${day}T${hhmm}:00Z`);
    const asMadrid = new Date(asUTC.toLocaleString('en-US', { timeZone: 'Europe/Madrid' }));
    const offsetMs = asUTC.getTime() - asMadrid.getTime();
    return new Date(asUTC.getTime() + offsetMs);
  }

  const startTime = utcInstant(date, slot);
  const endTime = new Date(startTime.getTime() + (eventType.duration + eventType.bufferTime) * 60000);

  // ------------------------------------------------------------------
  // Step 2: create the booking (public form payload shape)
  // ------------------------------------------------------------------
  const createRes = await fetch(`${APP_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventTypeIds: [eventType.id], // multi-service array — the shape that regressed
      guestName: 'Prueba E2E',
      guestEmail: MARKER,
      guestPhone: null,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      timezone: 'Europe/Madrid',
      locationId: null,
      formData: { guestName: 'Prueba E2E', guestEmail: MARKER, guestPhone: '', guestCountry: 'ES' },
    }),
  });
  const created = (await createRes.json()) as {
    success: boolean; error?: string; data?: { id?: string };
  };
  if (!createRes.ok || !created.success) {
    fail('create', new Error(`HTTP ${createRes.status}: ${created.error || 'unknown'}`));
  }
  bookingId = created.data?.id ?? null;
  if (!bookingId) fail('create', new Error('booking created but no id returned'));
  console.log(`✓ create: booking ${bookingId} (status ${created.data ? 'ok' : '?'})`);

  // ------------------------------------------------------------------
  // Step 3: verify it reaches the calendar feed (owner session)
  // ------------------------------------------------------------------
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
  if (!admin) fail('verify', new Error('no ADMIN user for session minting'));
  const token = await encode({
    token: { sub: admin.id, email: admin.email, name: 'E2E', role: 'ADMIN' },
    secret: process.env.NEXTAUTH_SECRET || 'fallback-secret',
    maxAge: 15 * 60,
  });
  const cookieName = APP_URL.startsWith('https') ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
  const feedRes = await fetch(`${APP_URL}/api/bookings`, {
    headers: { Cookie: `${cookieName}=${token}` },
  }).then((r) => r.json() as Promise<{ data?: Array<{ id: string }> }>).catch(() => null);
  const found = Array.isArray(feedRes?.data) && feedRes!.data!.some((b) => b.id === bookingId);
  if (!found) fail('verify', new Error('booking not present in GET /api/bookings feed'));
  console.log('✓ verify: booking appears in the calendar feed (GET /api/bookings)');

  // ------------------------------------------------------------------
  // Step 4: cleanup (hard delete, no emails)
  // ------------------------------------------------------------------
  await cleanup();
  console.log('\n✓ E2E PASSED — free booking flow works end to end');
}

main()
  .catch(() => process.exitCode = 1)
  .finally(async () => {
    if (process.exitCode === 1) await cleanup();
    await prisma.$disconnect();
  });
