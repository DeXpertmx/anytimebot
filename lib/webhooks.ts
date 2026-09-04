import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * Outgoing webhooks: notify external platforms when a booking changes state.
 *
 * Every status change fans out to all active endpoints of the booking owner.
 * Deliveries are persisted FIRST and executed best-effort afterwards, so a
 * slow/failed HTTP call never breaks the user's booking flow. Failures get
 * retried by /api/cron/webhook-retries with exponential backoff (max 5).
 *
 * Payloads are signed with each endpoint's secret:
 *   X-Anytimebot-Signature: sha256=<hex hmac of the raw body>
 *   X-Anytimebot-Event: booking.created | booking.confirmed | ...
 * Receivers verify the HMAC over the *raw* request body.
 */

export const WEBHOOK_EVENTS = [
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'booking.completed',
  'booking.rescheduled',
] as const;

/**
 * Injectable dependencies so the dispatcher is testable without a database
 * or network (see lib/whatsapp-manager.ts for the same pattern).
 */
export interface WebhookDeps {
  prisma?: typeof prisma;
  fetchImpl?: typeof fetch;
}

function resolveDeps(deps?: WebhookDeps) {
  return {
    prisma: deps?.prisma ?? prisma,
    fetchImpl: deps?.fetchImpl ?? fetch.bind(globalThis),
  };
}

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const USER_AGENT = 'Anytimebot-Webhooks/1.0';
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
/** Max deliveries processed per cron tick to keep the function inside its time budget. */
const CRON_BATCH_SIZE = 50;

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

export function signPayload(secret: string, rawBody: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

/** Verifies an incoming webhook request the way a receiver would (used by tests). */
export function verifySignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const expected = Buffer.from(signPayload(secret, rawBody));
  const received = Buffer.from(signatureHeader);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

interface BookingLike {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
  status: string;
  formData?: unknown;
  notes?: string | null;
  paymentStatus?: string | null;
  paymentAmount?: number | null;
  paymentCurrency?: string | null;
  eventType: {
    id: string;
    name: string;
    duration: number;
    location: string;
    videoLink?: string | null;
    bookingPage: {
      id: string;
      title: string;
      slug: string;
      userId: string;
    };
  };
}

export function buildBookingPayload(event: WebhookEvent, booking: BookingLike) {
  return {
    event,
    created_at: new Date().toISOString(),
    data: {
      id: booking.id,
      event_type: {
        id: booking.eventType.id,
        name: booking.eventType.name,
        duration_minutes: booking.eventType.duration,
        location: booking.eventType.location,
        video_link: booking.eventType.videoLink ?? null,
      },
      booking_page: {
        id: booking.eventType.bookingPage.id,
        title: booking.eventType.bookingPage.title,
        slug: booking.eventType.bookingPage.slug,
      },
      guest: {
        name: booking.guestName,
        email: booking.guestEmail,
        phone: booking.guestPhone,
      },
      start_time: booking.startTime.toISOString(),
      end_time: booking.endTime.toISOString(),
      timezone: booking.timezone,
      status: booking.status,
      payment: booking.paymentStatus
        ? { status: booking.paymentStatus, amount_cents: booking.paymentAmount ?? null, currency: booking.paymentCurrency ?? null }
        : null,
    },
  };
}

/** Best-effort single delivery attempt. Returns the resulting delivery record. */
export async function deliverWebhook(
  deliveryId: string,
  deps?: WebhookDeps,
): Promise<'DELIVERED' | 'FAILED'> {
  const { prisma: db, fetchImpl } = resolveDeps(deps);
  const delivery = await db.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: { endpoint: { select: { url: true, secret: true, active: true } } },
  });
  if (!delivery) return 'FAILED';
  if (!delivery.endpoint.active) {
    await db.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'FAILED', lastError: 'Endpoint disabled' },
    });
    return 'FAILED';
  }

  const rawBody = JSON.stringify(delivery.payload);
  const attempt = delivery.attempts + 1;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetchImpl(delivery.endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Anytimebot-Event': delivery.eventType,
        'X-Anytimebot-Signature': signPayload(delivery.endpoint.secret, rawBody),
        'X-Anytimebot-Delivery-Id': delivery.id,
      },
      body: rawBody,
      signal: controller.signal,
    });
    clearTimeout(timer);

    // 2xx counts as delivered; anything else schedules a retry.
    if (response.status >= 200 && response.status < 300) {
      await db.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'DELIVERED',
          attempts: attempt,
          responseStatus: response.status,
          lastError: null,
          nextRetryAt: null,
          deliveredAt: new Date(),
        },
      });
      return 'DELIVERED';
    }

    const bodyText = (await response.text().catch(() => '')).slice(0, 500);
    return scheduleRetry(db, deliveryId, attempt, response.status, `HTTP ${response.status}: ${bodyText}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return scheduleRetry(db, deliveryId, attempt, null, message);
  }
}

async function scheduleRetry(
  db: WebhookDeps['prisma'],
  deliveryId: string,
  attempt: number,
  responseStatus: number | null,
  error: string,
): Promise<'FAILED'> {
  const terminal = attempt >= MAX_ATTEMPTS;
  await db!.webhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status: terminal ? 'FAILED' : 'PENDING',
      attempts: attempt,
      responseStatus,
      lastError: error.slice(0, 500),
      // Exponential backoff: 1, 2, 4, 8... minutes between attempts.
      nextRetryAt: terminal ? null : new Date(Date.now() + Math.pow(2, attempt - 1) * 60_000),
    },
  });
  return 'FAILED';
}

/**
 * Fans a booking event out to every active endpoint of the owner.
 * Persistence happens first (fire-and-forget HTTP afterwards), so callers can
 * `await` this safely inside booking flows without latency spikes.
 */
export async function dispatchWebhookEvent(
  userId: string,
  event: WebhookEvent,
  payload: ReturnType<typeof buildBookingPayload>,
  deps?: WebhookDeps,
): Promise<void> {
  const { prisma: db } = resolveDeps(deps);
  try {
    const endpoints = await db.webhookEndpoint.findMany({
      where: {
        userId,
        active: true,
        OR: [{ events: '*' }, { events: { contains: event } }],
      },
      select: { id: true },
    });
    if (endpoints.length === 0) return;

    const deliveries = await Promise.all(
      endpoints.map((endpoint) =>
        db.webhookDelivery.create({
          data: { endpointId: endpoint.id, eventType: event, payload: payload as any },
          select: { id: true },
        }),
      ),
    );

    // Fire-and-forget: each delivery retries via cron if it fails here. Also
    // sweep due retries opportunistically — booking activity is frequent, so
    // failed deliveries get re-attempted within minutes without a paid cron.
    void Promise.allSettled(deliveries.map((d) => deliverWebhook(d.id, deps)));
    void processDueDeliveries(deps).catch(() => undefined);
  } catch (error) {
    // Never break the booking flow because of webhook plumbing.
    console.error('Failed to dispatch webhook event:', error);
  }
}

/**
 * Sweeps PENDING deliveries whose nextRetryAt has passed. Called by the daily
 * cron AND lazily (fire-and-forget) on every booking status change, so retries
 * effectively run within minutes of real activity without a paid cron plan.
 */
export async function processDueDeliveries(deps?: WebhookDeps): Promise<{ processed: number; delivered: number }> {
  const { prisma: db } = resolveDeps(deps);
  const due = await db.webhookDelivery.findMany({
    where: { status: 'PENDING', nextRetryAt: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: CRON_BATCH_SIZE,
    select: { id: true },
  });

  const results = await Promise.allSettled(due.map((d) => deliverWebhook(d.id, deps)));
  const delivered = results.filter((r) => r.status === 'fulfilled' && r.value === 'DELIVERED').length;
  return { processed: due.length, delivered };
}

/**
 * Cron entry: retries PENDING deliveries whose nextRetryAt has passed.
 * Authenticated with CRON_SECRET like every other cron endpoint.
 */
export async function processWebhookRetries(request: NextRequest, deps?: WebhookDeps): Promise<NextResponse> {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || 'dev-secret';
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { processed, delivered } = await processDueDeliveries(deps);
  return NextResponse.json({ success: true, processed, delivered, failed: processed - delivered });
}
