import { prisma } from '@/lib/db';

/**
 * Anytimebot -> Volkern CRM integration (REST API).
 *
 * Uses the documented Volkern public REST API (https://volkern.app/api/docs):
 *   POST /api/leads    -> create a lead   (scopes: leads:read, leads:write)
 *   GET  /api/leads    -> search leads by email
 *   POST /api/citas    -> create an appointment (citas:write)
 *   GET  /api/citas    -> list appointments in a window (citas:read)
 *   PATCH /api/citas/{id} -> cancel / reschedule (citas:write)
 *
 * Authentication is per-tenant: each Anytimebot user stores their own Volkern
 * tenant API key (generated in Volkern -> Configuración -> API) and it is sent
 * in the `x-api-key` header. The key identifies the Volkern tenant, so the
 * old username + webhook-secret webhook flow is no longer used.
 *
 * Bookings sync one-way: on BOOKING_CREATED we find-or-create the lead by
 * email and create the appointment; on CANCELLED/RESCHEDULED we locate the
 * appointment inside the original slot window and PATCH it.
 *
 * Bot-message sync (MESSAGE_RECEIVED) is PAUSED: the public Volkern REST API
 * does not expose an endpoint to create messages, so that flow is skipped.
 *
 * Everything is best-effort: a failure to reach Volkern never breaks the
 * booking/chat flow (same pattern as lib/webhooks.ts).
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
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED', // kept for API compat; sync paused
} as const;

export type VolkernEvent = (typeof VOLKERN_EVENTS)[keyof typeof VOLKERN_EVENTS];

const TIMEOUT_MS = 15_000;

/** Active integration config for a user (null when not configured). */
export async function getVolkernIntegration(userId: string, deps?: VolkernDeps) {
  const { prisma: db } = resolveDeps(deps);
  return db.volkernIntegration.findUnique({ where: { userId } });
}

/** Booking snapshot sent to Volkern (REST payload fields). */
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
  username?: string; // kept for back-compat; no longer used by REST
}

/** Extra fields for CANCELLED / RESCHEDULED events. */
export interface VolkernBookingExtra {
  cancelledAt?: Date;
  oldStartTime?: Date;
  newStartTime?: Date;
  newEndTime?: Date;
}

/**
 * Push a booking event to the configured Volkern tenant via the REST API.
 * Best-effort: never throws, never breaks the booking flow.
 */
export async function dispatchVolkernBookingEvent(
  userId: string,
  event: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED',
  booking: VolkernBookingPayload,
  extra?: VolkernBookingExtra,
  deps?: VolkernDeps,
): Promise<void> {
  try {
    const { prisma: db, fetchImpl } = resolveDeps(deps);
    const integration = await getVolkernIntegration(userId, deps);
    if (!integration || !integration.activo) return;
    if (!integration.sincronizarCitas) return;
    if (!integration.apiKey) return; // REST requires the tenant API key

    const baseUrl = integration.baseUrl.replace(/\/$/, '');
    const apiKey = integration.apiKey;

    if (event === 'BOOKING_CREATED') {
      const lead = await findOrCreateLead(baseUrl, apiKey, booking, fetchImpl);
      if (!lead) return;

      const durationMin = Math.max(
        1,
        Math.round((booking.endTime.getTime() - booking.startTime.getTime()) / 60_000),
      );
      const created = await createCita(baseUrl, apiKey, {
        leadId: lead.id,
        titulo: `${booking.eventTypeName} - ${booking.guestName}`,
        descripcion: [
          `Booking desde Anytimebot (ID: ${booking.id})`,
          `Tipo de evento: ${booking.eventTypeName}`,
          `Huso horario: ${booking.timezone}`,
          booking.guestPhone ? `Teléfono: ${booking.guestPhone}` : null,
          booking.meetingUrl ? `Link de reunión: ${booking.meetingUrl}` : null,
          booking.formData ? `Formulario: ${JSON.stringify(booking.formData)}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        fechaHora: booking.startTime.toISOString(),
        duracion: durationMin,
        linkReunion: booking.meetingUrl || undefined,
      }, fetchImpl);

      if (!created) return;

      await db.volkernIntegration.update({
        where: { id: integration.id },
        data: {
          totalCitasSincronizadas: { increment: 1 },
          ultimaSincronizacion: new Date(),
        },
      });
      return;
    }

    if (event === 'BOOKING_CANCELLED') {
      const cita = await findCitaInWindow(baseUrl, apiKey, booking, extra?.cancelledAt, fetchImpl);
      if (!cita) return;
      const patched = await patchCita(baseUrl, apiKey, cita.id, { estado: 'cancelada' }, fetchImpl);
      if (!patched) return;

      await db.volkernIntegration.update({
        where: { id: integration.id },
        data: {
          totalCitasSincronizadas: { increment: 1 },
          ultimaSincronizacion: new Date(),
        },
      });
      return;
    }

    if (event === 'BOOKING_RESCHEDULED') {
      // Locate by the OLD slot; PATCH moves it to the new one.
      const cita = await findCitaInWindow(baseUrl, apiKey, { ...booking, startTime: extra?.oldStartTime ?? booking.startTime }, extra?.newStartTime, fetchImpl);
      if (!cita) return;

      const end = extra?.newEndTime ?? booking.endTime;
      const start = extra?.newStartTime ?? booking.startTime;
      const durationMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));

      const patched = await patchCita(
        baseUrl,
        apiKey,
        cita.id,
        { fechaHora: start.toISOString(), duracion: durationMin },
        fetchImpl,
      );
      if (!patched) return;

      await db.volkernIntegration.update({
        where: { id: integration.id },
        data: {
          totalCitasSincronizadas: { increment: 1 },
          ultimaSincronizacion: new Date(),
        },
      });
    }
  } catch (error) {
    console.error('Failed to dispatch booking event to Volkern:', error);
  }
}

/**
 * Bot-message sync is PAUSED: the public Volkern REST API has no endpoint to
 * create conversation messages. Kept exported so existing callers compile;
 * it intentionally does nothing.
 */
export async function dispatchVolkernMessageEvent(
  _userId: string,
  _message: {
    botOwner: string;
    userMessage?: string;
    botResponse?: string;
    timestamp?: number;
    hasAttachments?: boolean;
    attachmentCount?: number;
  },
  _deps?: VolkernDeps,
): Promise<void> {
  // Intentionally a no-op. Messages will be re-enabled once Volkern exposes a
  // REST endpoint for creating messages.
  return;
}

// ---------------------------------------------------------------------------
// Volkern REST helpers (all best-effort, tolerant with API responses)
// ---------------------------------------------------------------------------

interface VolkernLead {
  id: string;
  email?: string | null;
}

async function findOrCreateLead(
  baseUrl: string,
  apiKey: string,
  booking: VolkernBookingPayload,
  fetchImpl: typeof fetch,
): Promise<VolkernLead | null> {
  // 1. Search for an existing lead by email (GET /api/leads?search=)
  const searchRes = await apiRequest(baseUrl, apiKey, `/api/leads?search=${encodeURIComponent(booking.guestEmail)}`, fetchImpl);
  if (searchRes.ok) {
    const leads = normalizeLeadArray(searchRes.body);
    const match = leads.find(
      (l: VolkernLead) => (l.email || '').toLowerCase() === booking.guestEmail.toLowerCase(),
    );
    if (match) return match;
  }

  // 2. Create the lead (POST /api/leads)
  const createRes = await apiRequest(baseUrl, apiKey, '/api/leads', fetchImpl, {
    method: 'POST',
    body: {
      nombre: booking.guestName,
      email: booking.guestEmail,
      telefono: booking.guestPhone || undefined,
      fuente: 'Anytimebot',
      notas: `Sincronizado desde Anytimebot (booking ${booking.id}). Tipo de evento: ${booking.eventTypeName}.`,
    },
  });
  if (!createRes.ok) {
    console.error(`Volkern create lead failed (${createRes.status}):`, String(createRes.body).slice(0, 300));
    return null;
  }
  const created = Array.isArray(createRes.body) ? createRes.body[0] : createRes.body;
  if (created?.id) return created as VolkernLead;
  console.error('Volkern create lead returned no id:', String(createRes.body).slice(0, 300));
  return null;
}

async function createCita(
  baseUrl: string,
  apiKey: string,
  cita: {
    leadId: string;
    titulo: string;
    descripcion?: string;
    fechaHora: string;
    duracion: number;
    linkReunion?: string;
  },
  fetchImpl: typeof fetch,
): Promise<{ id: string } | null> {
  const res = await apiRequest(baseUrl, apiKey, '/api/citas', fetchImpl, {
    method: 'POST',
    body: {
      leadId: cita.leadId,
      titulo: cita.titulo,
      descripcion: cita.descripcion,
      fechaHora: cita.fechaHora,
      duracion: cita.duracion,
      estado: 'pendiente',
      tipo: 'reunion',
      linkReunion: cita.linkReunion,
    },
  });
  if (!res.ok) {
    console.error(`Volkern create cita failed (${res.status}):`, String(res.body).slice(0, 300));
    return null;
  }
  const body = (res.body || {}) as { cita?: { id: string } };
  if (body.cita?.id) return body.cita;
  if ((res.body as { id?: string })?.id) return res.body as { id: string };
  console.error('Volkern create cita returned no id:', String(res.body).slice(0, 300));
  return null;
}

/** Locate the Volkern appointment overlapping the booking start time (±2 min) for the same guest email. */
async function findCitaInWindow(
  baseUrl: string,
  apiKey: string,
  booking: VolkernBookingPayload,
  _newTime: Date | undefined,
  fetchImpl: typeof fetch,
): Promise<{ id: string } | null> {
  const start = new Date(booking.startTime);
  const from = new Date(start.getTime() - 2 * 60_000).toISOString();
  const to = new Date(start.getTime() + 2 * 60_000).toISOString();

  const res = await apiRequest(
    baseUrl,
    apiKey,
    `/api/citas?fechaInicio=${encodeURIComponent(from)}&fechaFin=${encodeURIComponent(to)}`,
    fetchImpl,
  );
  if (!res.ok) {
    console.error(`Volkern list citas failed (${res.status}):`, String(res.body).slice(0, 300));
    return null;
  }

  const citas = Array.isArray(res.body) ? res.body : [];
  const targetMs = start.getTime();
  const match = citas.find((c: { id: string; lead?: { email?: string } | null; fechaHora?: string }) => {
    const leadEmail = (c.lead?.email || '').toLowerCase();
    if (booking.guestEmail && leadEmail !== booking.guestEmail.toLowerCase()) return false;
    if (c.fechaHora) {
      const diff = Math.abs(new Date(c.fechaHora).getTime() - targetMs);
      if (diff > 4 * 60_000) return false; // window generous enough for rounding
    }
    return Boolean(c.id);
  });

  return match ? { id: match.id } : null;
}

async function patchCita(
  baseUrl: string,
  apiKey: string,
  citaId: string,
  data: { estado?: string; fechaHora?: string; duracion?: number },
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const res = await apiRequest(baseUrl, apiKey, `/api/citas/${citaId}`, fetchImpl, {
    method: 'PATCH',
    body: data,
  });
  if (!res.ok) {
    console.error(`Volkern patch cita ${citaId} failed (${res.status}):`, String(res.body).slice(0, 300));
    return false;
  }
  return true;
}

/** Normalize the /api/leads response to an array regardless of wrapper shape. */
function normalizeLeadArray(body: unknown): VolkernLead[] {
  if (Array.isArray(body)) return body as VolkernLead[];
  if (body && typeof body === 'object') {
    const b = body as { leads?: unknown; data?: unknown };
    if (Array.isArray(b.leads)) return b.leads as VolkernLead[];
    if (Array.isArray(b.data)) return b.data as VolkernLead[];
  }
  return [];
}

interface ApiResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function apiRequest(
  baseUrl: string,
  apiKey: string,
  path: string,
  fetchImpl: typeof fetch,
  options?: { method?: 'GET' | 'POST' | 'PATCH'; body?: Record<string, unknown> },
): Promise<ApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${baseUrl}${path}`, {
      method: options?.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'User-Agent': 'Anytimebot-Volkern/1.0',
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}
