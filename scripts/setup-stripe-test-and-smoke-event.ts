/**
 * One-time (idempotent) setup: put Stripe in TEST mode and leave a permanent
 * paid event type so the post-deploy smoke's payment flow always has a real,
 * harmless target.
 *
 *   npx tsx scripts/setup-stripe-test-and-smoke-event.ts
 *
 * What it does (safe to re-run):
 *   1. Verifies test-mode credentials exist (never prints their values).
 *   2. Switches the active Stripe mode to 'test' (SystemSetting stripe.mode)
 *      and writes a SET_STRIPE_MODE row to the admin audit log.
 *   3. Ensures a hidden booking page "smoke-internal" exists on the admin
 *      account, with availability Mon–Fri 09:00–17:00 (Europe/Madrid).
 *   4. Ensures a paid event "Smoke Test Event" (10,00 € / 30 min) lives on
 *      that page — the permanent target for `npm run smoke`'s payment flow.
 *
 * Requires .env.local with the production DATABASE_URL.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PAGE_SLUG = 'smoke-internal';
const EVENT_NAME = 'Smoke Test Event';
const ADMIN_EMAIL = 'dexpertmx@gmail.com';

async function main(): Promise<void> {
  // --- 1+2. Switch Stripe to test mode (only if its credentials exist) ------
  // The switch never happens blind: without test keys, payments would break.
  // The rest of the setup (page + event) runs regardless; re-run after saving
  // the test keys in Admin → Stripe to complete the switch.
  const { isModeConfigured, getStripeMode, setStripeMode } = await import('../lib/stripe-mode');
  if (await isModeConfigured('test')) {
    console.log('✓ Test-mode credentials present');
    const previous = await getStripeMode();
    if (previous !== 'test') {
      await setStripeMode('test');
      const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true } });
      if (admin) {
        await prisma.adminAuditLog.create({
          data: {
            adminId: admin.id,
            action: 'SET_STRIPE_MODE',
            targetId: null,
            details: { previous, mode: 'test', reason: 'setup-stripe-test-and-smoke-event' },
            ipAddress: null,
            userAgent: 'scripts/setup-stripe-test-and-smoke-event.ts',
          },
        });
      }
      console.log(`✓ Stripe mode switched: ${previous} → test`);
    } else {
      console.log('= Stripe already in test mode');
    }
  } else {
    console.log(
      '⚠ Test-mode credentials NOT configured — mode stays as-is. Save sk_test/pk_test/whsec_test in Admin → Stripe (modo test) and re-run this script.'
    );
  }

  // --- 3. Hidden booking page for smoke events ------------------------------
  const admin = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true, name: true },
  });
  if (!admin) throw new Error(`Admin user ${ADMIN_EMAIL} not found`);

  const page = await prisma.bookingPage.upsert({
    where: { userId_slug: { userId: admin.id, slug: PAGE_SLUG } },
    create: {
      userId: admin.id,
      slug: PAGE_SLUG,
      title: 'Internal — smoke tests',
      description: 'Page reserved for automated smoke tests. Not shared with customers.',
      isActive: true, // check-availability requires an active page; it stays internal because the URL is not shared
      slotInterval: 30,
    },
    update: { isActive: true }, // heal earlier runs created inactive; check-availability requires an active page
  });
  console.log(`✓ Booking page ready: ${PAGE_SLUG} (${page.id})`);

  const days = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' },
  ];
  const existingAvail = await prisma.availability.count({
    where: { bookingPageId: page.id },
  });
  if (existingAvail === 0) {
    await prisma.availability.createMany({
      data: days.map((d) => ({ ...d, bookingPageId: page.id, isAvailable: true })),
    });
    console.log('✓ Availability created: Mon–Fri 09:00–17:00');
  } else {
    console.log(`= Availability already present (${existingAvail} rules)`);
  }

  // --- 4. Permanent paid event type ------------------------------------------
  const existingEvent = await prisma.eventType.findFirst({
    where: { bookingPageId: page.id, name: EVENT_NAME },
    select: { id: true },
  });
  const eventData = {
    duration: 30,
    bufferTime: 0,
    location: 'video',
    videoLink: null,
    color: '#6366f1',
    requiresConfirmation: false,
    price: 1000, // 10,00 € — token amount, never actually charged by the smoke
    currency: 'eur',
    collectPayment: true,
    paymentInterval: 'ONE_TIME',
  };
  if (existingEvent) {
    await prisma.eventType.update({ where: { id: existingEvent.id }, data: eventData });
    console.log(`= Paid event updated: ${EVENT_NAME} (${existingEvent.id}) — 10,00 €`);
  } else {
    const ev = await prisma.eventType.create({
      data: { bookingPageId: page.id, name: EVENT_NAME, ...eventData },
      select: { id: true },
    });
    console.log(`✓ Paid event created: ${EVENT_NAME} (${ev.id}) — 10,00 €`);
  }

  const stripeModeModule = await import('../lib/stripe-mode');
  const finalMode = await stripeModeModule.getStripeMode();
  console.log(`\nDone. Active Stripe mode: ${finalMode}. \`npm run smoke\` will now always find a paid target.${finalMode !== 'test' ? ' (Still in LIVE mode — save the test keys and re-run to switch.)' : ''}`);
}

main()
  .catch((error) => {
    console.error('✗ Setup failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
