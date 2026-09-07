import crypto from 'crypto';
import { prisma } from '@/lib/db';

/**
 * Anytimebot -> Volkern CRM integration.
 *
 * Volkern exposes webhook receivers (already built in the Volkern codebase):
 *   POST {baseUrl}/api/webhooks/anytimebot          (unified: bookings + messages)
 *   POST {baseUrl}/api/webhooks/anytimebot/citas    (bookings only)
 *   POST {baseUrl}/api/webhooks/anytimebot/mensajes (messages only)
 *
 * This module reads the per-user VolkernIntegration config and pushes booking
 * and message events with the exact payload/headers Volkern expects:
 *   - Headers: x-webhook-signature (HMAC-SHA256 hex over the raw body),
 *     x-webhook-id, x-webhook-event
 *   - Events:  BOOKING_CREATED | BOOKING_CANCELLED | BOOKING_RESCHEDULED
 *              | MESSAGE_RECEIVED
 *
 * Everything is best-effort: a failure to reach Volkern never breaks the
 * booking/chat flow (same pattern as lib/webhooks.ts).
 */

/**
 * Injectable dependencies so the dispatcher is testable without a database
 * or network (same pattern as lib/webhooks.ts).
 */
export interface VolkernDeps {
  prisma?: typeof prisma;
  fetchImpl?: typeof fetch;
}

function resolveDeps(deps?: VolkernDeps) {
  return {
    prisma: deps?.prisma ?? prisma,
    fetchImpl: deps?.fetchImpl ?? fetch.bind(globalThis),
  };
}

export const VOLKERN_EVENTS = {
  BOOKING_CREATED: 'BOOKING_CREATED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  BOOKING_RESCHEDULED: 'BOOKING_RESCHEDULED',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
} as const;

export type VolkernEvent = (typeof VOLKERN_EVENTS)[keyof typeof VOLKERN_EVENTS];

const TIMEOUT_MS = 10_000;

/** Active integration config for a user (null when not configured). */
export async function getVolkernIntegration(userId: string, deps?: VolkernDeps) {
  const { prisma: db } = resolveDeps(deps);
  return db.volkernIntegration.findUnique({ where: { userId } });
}

/** HMAC-SHA256 hex over the raw body — matches Volkern's verifyWebhookSignature. */
export function signVolkernPayload(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/** Booking snapshot sent to Volkern (fields match what Volkern's handlers read). */
export interface VolkernBookingPayload {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startTime: Date;
  endTime: Date;
  timezone: string;
  eventTypeName: string;
  formData?: unknown;
  meetingUrl?: string | null;
  /** Anytimebot username so Volkern resolves the right tenant. Resolved from
   *  the user record when omitted. */
  username?: string;
}

/** Extra fields for CANCELLED / RESCHEDULED events. */
export interface VolkernBookingExtra {
  cancelledAt?: Date;
  oldStartTime?: Date;
  newStartTime?: Date;
  newEndTime?: Date;
}

/**
 * Push a booking event to the configured Volkern instance (unified webhook).
 * Best-effort: resolves the user's integration, signs the body and POSTs.
 * Never throws.
 */
export async function dispatchVolkernBookingEvent(
  userId: string,
  event: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED',
  booking: VolkernBookingPayload,
  extra?: VolkernBookingExtra,
  deps?: VolkernDeps,
): Promise<void> {
  try {
    const { prisma: db } = resolveDeps(deps);
    const integration = await getVolkernIntegration(userId, deps);
    if (!integration || !integration.activo) return;
    if (!integration.sincronizarCitas) return;

    const baseUrl = integration.baseUrl.replace(/\/$/, '');
    const username =
      booking.username || (await resolveUsername(userId, deps));
    const payload = {
      event,
      data: {
        booking: {
          id: booking.id,
          guestName: booking.guestName,
          guestEmail: booking.guestEmail,
          guestPhone: booking.guestPhone,
          startTime: booking.startTime.toISOString(),
          endTime: booking.endTime.toISOString(),
          timezone: booking.timezone,
          eventType: booking.eventTypeName,
          videoMeetingLink: booking.meetingUrl || null,
          formData: booking.formData || null,
          username,
          ...(extra?.cancelledAt ? { cancelledAt: extra.cancelledAt.toISOString() } : {}),
          ...(extra?.oldStartTime ? { oldStartTime: extra.oldStartTime.toISOString() } : {}),
          ...(extra?.newStartTime ? { newStartTime: extra.newStartTime.toISOString() } : {}),
          ...(extra?.newEndTime ? { newEndTime: extra.newEndTime.toISOString() } : {}),
        },
      },
    };

    await postToVolkern(integration.id, baseUrl, event, payload, deps);
    await db.volkernIntegration.update({
      where: { id: integration.id },
      data: {
        totalCitasSincronizadas: { increment: 1 },
        ultimaSincronizacion: new Date(),
      },
    });
  } catch (error) {
    console.error('Failed to dispatch booking event to Volkern:', error);
  }
}

/** Push a bot conversation turn (inbound + outbound) to Volkern. */
export async function dispatchVolkernMessageEvent(
  userId: string,
  message: {
    botOwner: string; // Anytimebot username of the bot owner
    userMessage?: string;
    botResponse?: string;
    timestamp?: number;
    hasAttachments?: boolean;
    attachmentCount?: number;
  },
  deps?: VolkernDeps,
): Promise<void> {
  try {
    const { prisma: db } = resolveDeps(deps);
    const integration = await getVolkernIntegration(userId, deps);
    if (!integration || !integration.activo || !integration.sincronizarMensajes) return;
    if (!message.userMessage && !message.botResponse) return;

    const baseUrl = integration.baseUrl.replace(/\/$/, '');
    const payload = {
      event: VOLKERN_EVENTS.MESSAGE_RECEIVED,
      data: {
        message: {
          botOwner: message.botOwner,
          userMessage: message.userMessage || '',
          botResponse: message.botResponse || '',
          timestamp: message.timestamp || Date.now(),
          hasAttachments: message.hasAttachments || false,
          attachmentCount: message.attachmentCount || 0,
        },
      },
    };

    await postToVolkern(integration.id, baseUrl, VOLKERN_EVENTS.MESSAGE_RECEIVED, payload, deps);
    await db.volkernIntegration.update({
      where: { id: integration.id },
      data: {
        totalMensajesSincronizados: { increment: 1 },
        ultimaSincronizacion: new Date(),
      },
    });
  } catch (error) {
    console.error('Failed to dispatch message event to Volkern:', error);
  }
}

/** Resolve the user's Anytimebot username (falls back to email). */
async function resolveUsername(userId: string, deps?: VolkernDeps): Promise<string> {
  const { prisma: db } = resolveDeps(deps);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { username: true, email: true },
  });
  return user?.username || user?.email || userId;
}

/** Single signed POST to Volkern's unified webhook. Throws on failure. */
async function postToVolkern(
  integrationId: string,
  baseUrl: string,
  event: VolkernEvent,
  payload: Record<string, unknown>,
  deps?: VolkernDeps,
): Promise<void> {
  const { prisma: db, fetchImpl } = resolveDeps(deps);
  const integration = await db.volkernIntegration.findUnique({
    where: { id: integrationId },
  });
  if (!integration) return;

  const rawBody = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Anytimebot-Webhooks/1.0',
    'x-webhook-id': crypto.randomUUID(),
    'x-webhook-event': event,
  };
  if (integration.webhookSecret) {
    headers['x-webhook-signature'] = signVolkernPayload(integration.webhookSecret, rawBody);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${baseUrl}/api/webhooks/anytimebot`, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error(`Volkern webhook returned ${response.status}: ${text.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}