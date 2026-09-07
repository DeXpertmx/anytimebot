/**
 * Tests for the Volkern CRM integration dispatcher (lib/volkern.ts).
 *
 * The integration talks to the Volkern public REST API using the tenant API
 * key (x-api-key). Runs with node:test + tsx using the project's dependency
 * injection pattern: a fake prisma client and a programmable fetch double are
 * passed into every call — no module mocking, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dispatchVolkernBookingEvent, dispatchVolkernMessageEvent, type VolkernDeps } from './volkern';

// ---------------------------------------------------------------------------
// Fake prisma client (volkernIntegration + user lookups)
// ---------------------------------------------------------------------------

interface FakeVolkernIntegration {
  id: string;
  userId: string;
  baseUrl: string;
  username: string;
  webhookSecret: string | null;
  apiKey: string | null;
  activo: boolean;
  sincronizarCitas: boolean;
  sincronizarMensajes: boolean;
  totalCitasSincronizadas: number;
  totalMensajesSincronizados: number;
  ultimaSincronizacion: Date | null;
}

function makeFakeDb(initial: Partial<FakeVolkernIntegration> = {}) {
  let integration: FakeVolkernIntegration | null = {
    id: 'volkern_1',
    userId: 'user_1',
    baseUrl: 'https://volkern.app',
    username: 'mi-usuario',
    webhookSecret: null,
    apiKey: 'vk_prod_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    activo: true,
    sincronizarCitas: true,
    sincronizarMensajes: true,
    totalCitasSincronizadas: 0,
    totalMensajesSincronizados: 0,
    ultimaSincronizacion: null,
    ...initial,
  };

  const db: any = {
    volkernIntegration: {
      findUnique: async ({ where }: any) => {
        if (!integration) return null;
        if (where.userId && where.userId !== integration.userId) return null;
        if (where.id && where.id !== integration.id) return null;
        return integration;
      },
      update: async ({ where, data }: any) => {
        if (!integration) return null;
        integration = {
          ...integration,
          ...data,
          totalCitasSincronizadas:
            integration.totalCitasSincronizadas + (data.totalCitasSincronizadas?.increment ?? 0),
          totalMensajesSincronizados:
            integration.totalMensajesSincronizados + (data.totalMensajesSincronizados?.increment ?? 0),
        };
        return integration;
      },
    },
    user: {
      findUnique: async ({ where }: any) => {
        if (where.id === 'user_1') {
          return { id: 'user_1', username: 'mi-usuario', email: 'user@example.com' };
        }
        return null;
      },
    },
  };

  return { db, getIntegration: () => integration, setIntegration: (i: FakeVolkernIntegration | null) => { integration = i; } };
}

// ---------------------------------------------------------------------------
// Programmable fetch double
// ---------------------------------------------------------------------------

function jsonResponse(status = 200, body?: unknown) {
  const text = JSON.stringify(body === undefined ? {} : body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as unknown as Response;
}

type FetchCall = { url: string; init: any };

/** Queue of [status, body] responses returned in order. The last one repeats. */
function makeFetch(capture: { calls: FetchCall[] }, responses: { status?: number; body?: unknown }[]) {
  let idx = 0;
  const fetchImpl = (async (url: any, init: any) => {
    capture.calls.push({ url: String(url), init });
    const res = responses[Math.min(idx, responses.length - 1)] || { status: 200, body: {} };
    idx += 1;
    return jsonResponse(res.status ?? 200, res.body);
  }) as unknown as typeof fetch;
  return fetchImpl;
}

const apiKey =
  'vk_prod_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function bookingFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'bk_1',
    guestName: 'Juan Pérez',
    guestEmail: 'juan@example.com',
    guestPhone: '+34612345678',
    startTime: new Date('2026-09-10T10:00:00Z'),
    endTime: new Date('2026-09-10T11:00:00Z'),
    timezone: 'Europe/Madrid',
    eventTypeName: 'Consulta inicial',
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('BOOKING_CREATED searches for the lead, creates it when missing, then creates the cita', async () => {
  const { db, getIntegration } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  // 1. lead search -> empty array; 2. create lead -> {id:'lead_9'}; 3. create cita -> {success:true,cita:{id:'cita_1'}}
  const deps: VolkernDeps = {
    prisma: db,
    fetchImpl: makeFetch(capture, [
      { status: 200, body: [] },
      { status: 200, body: { id: 'lead_9', email: 'juan@example.com' } },
      { status: 200, body: { success: true, cita: { id: 'cita_1' } } },
    ]),
  };

  await dispatchVolkernBookingEvent('user_1', 'BOOKING_CREATED', bookingFixture(), undefined, deps);

  assert.equal(capture.calls.length, 3);
  const [search, createLead, createCita] = capture.calls;

  assert.equal(search.url, `https://volkern.app/api/leads?search=${encodeURIComponent('juan@example.com')}`);
  assert.equal(search.init.method, 'GET');
  assert.equal(search.init.headers['x-api-key'], apiKey);

  assert.equal(createLead.url, 'https://volkern.app/api/leads');
  assert.equal(createLead.init.method, 'POST');
  const leadBody = JSON.parse(String(createLead.init.body));
  assert.equal(leadBody.nombre, 'Juan Pérez');
  assert.equal(leadBody.email, 'juan@example.com');
  assert.equal(leadBody.telefono, '+34612345678');

  assert.equal(createCita.url, 'https://volkern.app/api/citas');
  assert.equal(createCita.init.method, 'POST');
  const citaBody = JSON.parse(String(createCita.init.body));
  assert.equal(citaBody.leadId, 'lead_9');
  assert.equal(citaBody.fechaHora, '2026-09-10T10:00:00.000Z');
  assert.equal(citaBody.duracion, 60);
  assert.equal(citaBody.estado, 'pendiente');

  // Stats updated after success
  assert.equal(getIntegration()?.totalCitasSincronizadas, 1);
  assert.ok(getIntegration()?.ultimaSincronizacion);
});

test('BOOKING_CREATED reuses an existing lead found by email (no duplicate)', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = {
    prisma: db,
    fetchImpl: makeFetch(capture, [
      { status: 200, body: [{ id: 'lead_existente', email: 'Juan@Example.com' }] },
      { status: 200, body: { success: true, cita: { id: 'cita_2' } } },
    ]),
  };

  await dispatchVolkernBookingEvent('user_1', 'BOOKING_CREATED', bookingFixture(), undefined, deps);

  assert.equal(capture.calls.length, 2);
  assert.ok(capture.calls[0].url.includes('/api/leads?search='));
  assert.equal(capture.calls[1].url, 'https://volkern.app/api/citas');
  const citaBody = JSON.parse(String(capture.calls[1].init.body));
  assert.equal(citaBody.leadId, 'lead_existente');
});

test('BOOKING_CANCELLED locates the cita in the slot window and PATCHes it cancelled', async () => {
  const { db, getIntegration } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = {
    prisma: db,
    fetchImpl: makeFetch(capture, [
      {
        status: 200,
        body: [
          {
            id: 'cita_5',
            lead: { email: 'juan@example.com' },
            fechaHora: '2026-09-10T10:00:00.000Z',
          },
        ],
      },
      { status: 200, body: { success: true } },
    ]),
  };

  await dispatchVolkernBookingEvent(
    'user_1',
    'BOOKING_CANCELLED',
    bookingFixture(),
    { cancelledAt: new Date('2026-09-10T12:00:00Z') },
    deps,
  );

  assert.equal(capture.calls.length, 2);
  assert.ok(capture.calls[0].url.startsWith('https://volkern.app/api/citas?'));
  assert.equal(capture.calls[1].url, 'https://volkern.app/api/citas/cita_5');
  assert.equal(capture.calls[1].init.method, 'PATCH');
  const body = JSON.parse(String(capture.calls[1].init.body));
  assert.equal(body.estado, 'cancelada');
  assert.equal(getIntegration()?.totalCitasSincronizadas, 1);
});

test('BOOKING_RESCHEDULED locates the old cita and PATCHes the new slot', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = {
    prisma: db,
    fetchImpl: makeFetch(capture, [
      {
        status: 200,
        body: [
          {
            id: 'cita_7',
            lead: { email: 'juan@example.com' },
            fechaHora: '2026-09-10T10:00:00.000Z',
          },
        ],
      },
      { status: 200, body: { success: true } },
    ]),
  };

  await dispatchVolkernBookingEvent(
    'user_1',
    'BOOKING_RESCHEDULED',
    bookingFixture(),
    {
      oldStartTime: new Date('2026-09-10T10:00:00Z'),
      newStartTime: new Date('2026-09-11T15:00:00Z'),
      newEndTime: new Date('2026-09-11T16:00:00Z'),
    },
    deps,
  );

  assert.equal(capture.calls.length, 2);
  assert.equal(capture.calls[1].url, 'https://volkern.app/api/citas/cita_7');
  const body = JSON.parse(String(capture.calls[1].init.body));
  assert.equal(body.fechaHora, '2026-09-11T15:00:00.000Z');
  assert.equal(body.duracion, 60);
});

test('does not send when citas sync is disabled', async () => {
  const { db } = makeFakeDb({ sincronizarCitas: false });
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture, []) };

  await dispatchVolkernBookingEvent('user_1', 'BOOKING_CREATED', bookingFixture(), undefined, deps);

  assert.equal(capture.calls.length, 0);
});

test('does not send without an integration', async () => {
  const { db, setIntegration } = makeFakeDb();
  setIntegration(null);
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture, []) };

  await dispatchVolkernBookingEvent('user_1', 'BOOKING_CREATED', bookingFixture(), undefined, deps);

  assert.equal(capture.calls.length, 0);
});

test('does not send without an api key configured', async () => {
  const { db } = makeFakeDb({ apiKey: null });
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture, []) };

  await dispatchVolkernBookingEvent('user_1', 'BOOKING_CREATED', bookingFixture(), undefined, deps);

  assert.equal(capture.calls.length, 0);
});

test('non-2xx responses are tolerated and do not throw', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = {
    prisma: db,
    fetchImpl: makeFetch(capture, [
      { status: 500, body: { error: 'boom' } },
      { status: 401, body: { error: 'sin permisos' } },
    ]),
  };

  await dispatchVolkernBookingEvent('user_1', 'BOOKING_CREATED', bookingFixture(), undefined, deps);
  assert.equal(capture.calls.length, 2); // search + create lead (create lead fails, no cita attempt)
});

test('message sync is paused: dispatchVolkernMessageEvent is a no-op', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture, []) };

  await dispatchVolkernMessageEvent(
    'user_1',
    { botOwner: 'mi-usuario', userMessage: 'Hola', botResponse: 'Hola!' },
    deps,
  );

  assert.equal(capture.calls.length, 0);
});
