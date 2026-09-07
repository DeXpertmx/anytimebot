/**
 * Tests for the Volkern CRM integration dispatcher (lib/volkern.ts).
 *
 * Runs with node:test + tsx. Uses the project's dependency-injection pattern
 * (same as lib/webhooks.test.ts): a fake prisma client and a programmable
 * fetch double are passed into each call — no module mocking, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

import {
  dispatchVolkernBookingEvent,
  dispatchVolkernMessageEvent,
  signVolkernPayload,
  type VolkernDeps,
} from './volkern';

// ---------------------------------------------------------------------------
// Fake prisma client (volkernIntegration + user lookups)
// ---------------------------------------------------------------------------

interface FakeVolkernIntegration {
  id: string;
  userId: string;
  baseUrl: string;
  username: string;
  webhookSecret: string | null;
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

function jsonResponse(status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (status >= 200 && status < 300 ? '' : '{}'),
  } as unknown as Response;
}

type FetchCall = { url: string; init: any };

function makeFetch(capture: { calls: FetchCall[] }, status = 200) {
  const fetchImpl = (async (url: any, init: any) => {
    capture.calls.push({ url: String(url), init });
    return jsonResponse(status);
  }) as unknown as typeof fetch;
  return fetchImpl;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('dispatchVolkernBookingEvent sends BOOKING_CREATED with the expected payload', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture) };

  await dispatchVolkernBookingEvent(
    'user_1',
    'BOOKING_CREATED',
    {
      id: 'bk_1',
      guestName: 'Juan Pérez',
      guestEmail: 'juan@example.com',
      guestPhone: '+34612345678',
      startTime: new Date('2026-09-10T10:00:00Z'),
      endTime: new Date('2026-09-10T11:00:00Z'),
      timezone: 'Europe/Madrid',
      eventTypeName: 'Consulta inicial',
    },
    undefined,
    deps,
  );

  assert.equal(capture.calls.length, 1);
  const { url, init } = capture.calls[0];
  assert.equal(url, 'https://volkern.app/api/webhooks/anytimebot');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers?.['x-webhook-event'], 'BOOKING_CREATED');

  const body = JSON.parse(String(init.body));
  assert.equal(body.event, 'BOOKING_CREATED');
  assert.equal(body.data.booking.id, 'bk_1');
  assert.equal(body.data.booking.guestName, 'Juan Pérez');
  assert.equal(body.data.booking.guestEmail, 'juan@example.com');
  assert.equal(body.data.booking.username, 'mi-usuario');
  assert.equal(body.data.booking.eventType, 'Consulta inicial');
  assert.equal(body.data.booking.startTime, '2026-09-10T10:00:00.000Z');
});

test('dispatchVolkernBookingEvent signs the payload with the webhook secret', async () => {
  const { db } = makeFakeDb({ webhookSecret: 'secreto-123' });
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture) };

  await dispatchVolkernBookingEvent(
    'user_1',
    'BOOKING_CREATED',
    {
      id: 'bk_2',
      guestName: 'Ana',
      guestEmail: 'ana@example.com',
      guestPhone: null,
      startTime: new Date('2026-09-11T09:00:00Z'),
      endTime: new Date('2026-09-11T09:30:00Z'),
      timezone: 'UTC',
      eventTypeName: 'Llamada',
    },
    undefined,
    deps,
  );

  const { init } = capture.calls[0];
  const body = String(init.body);
  const expected = signVolkernPayload('secreto-123', body);
  assert.equal(init.headers?.['x-webhook-signature'], expected);
});

test('dispatchVolkernBookingEvent does not send when citas sync is disabled', async () => {
  const { db } = makeFakeDb({ sincronizarCitas: false });
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture) };

  await dispatchVolkernBookingEvent(
    'user_1',
    'BOOKING_CREATED',
    {
      id: 'bk_3',
      guestName: 'Luis',
      guestEmail: 'luis@example.com',
      guestPhone: null,
      startTime: new Date('2026-09-12T08:00:00Z'),
      endTime: new Date('2026-09-12T09:00:00Z'),
      timezone: 'UTC',
      eventTypeName: 'Corte',
    },
    undefined,
    deps,
  );

  assert.equal(capture.calls.length, 0);
});

test('dispatchVolkernBookingEvent does not send without an integration', async () => {
  const { db, setIntegration } = makeFakeDb();
  setIntegration(null);
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture) };

  await dispatchVolkernBookingEvent(
    'user_1',
    'BOOKING_CREATED',
    {
      id: 'bk_4',
      guestName: 'Marta',
      guestEmail: 'marta@example.com',
      guestPhone: null,
      startTime: new Date('2026-09-12T10:00:00Z'),
      endTime: new Date('2026-09-12T11:00:00Z'),
      timezone: 'UTC',
      eventTypeName: 'Reunión',
    },
    undefined,
    deps,
  );

  assert.equal(capture.calls.length, 0);
});

test('dispatchVolkernBookingEvent includes cancellation extras', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture) };

  await dispatchVolkernBookingEvent(
    'user_1',
    'BOOKING_CANCELLED',
    {
      id: 'bk_5',
      guestName: 'Pedro',
      guestEmail: 'pedro@example.com',
      guestPhone: null,
      startTime: new Date('2026-09-13T10:00:00Z'),
      endTime: new Date('2026-09-13T11:00:00Z'),
      timezone: 'UTC',
      eventTypeName: 'Consulta',
    },
    { cancelledAt: new Date('2026-09-13T12:00:00Z') },
    deps,
  );

  const body = JSON.parse(String(capture.calls[0].init.body));
  assert.equal(body.event, 'BOOKING_CANCELLED');
  assert.equal(body.data.booking.cancelledAt, '2026-09-13T12:00:00.000Z');
});

test('dispatchVolkernMessageEvent sends MESSAGE_RECEIVED with both sides of the conversation', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture) };

  await dispatchVolkernMessageEvent(
    'user_1',
    {
      botOwner: 'mi-usuario',
      userMessage: 'Hola, quiero agendar',
      botResponse: '¡Claro! ¿Qué día te viene bien?',
      timestamp: 1726000000000,
    },
    deps,
  );

  assert.equal(capture.calls.length, 1);
  const { init } = capture.calls[0];
  assert.equal(init.headers?.['x-webhook-event'], 'MESSAGE_RECEIVED');
  const body = JSON.parse(String(init.body));
  assert.equal(body.event, 'MESSAGE_RECEIVED');
  assert.equal(body.data.message.botOwner, 'mi-usuario');
  assert.equal(body.data.message.userMessage, 'Hola, quiero agendar');
  assert.equal(body.data.message.botResponse, '¡Claro! ¿Qué día te viene bien?');
  assert.equal(body.data.message.timestamp, 1726000000000);
});

test('dispatchVolkernMessageEvent skips when mensajes sync is disabled', async () => {
  const { db } = makeFakeDb({ sincronizarMensajes: false });
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture) };

  await dispatchVolkernMessageEvent(
    'user_1',
    { botOwner: 'mi-usuario', userMessage: 'Hola' },
    deps,
  );

  assert.equal(capture.calls.length, 0);
});

test('dispatchVolkernMessageEvent skips when both sides are empty', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture) };

  await dispatchVolkernMessageEvent('user_1', { botOwner: 'mi-usuario' }, deps);

  assert.equal(capture.calls.length, 0);
});

test('signVolkernPayload produces a stable HMAC-SHA256 hex', () => {
  const raw = JSON.stringify({ hello: 'world' });
  const expected = crypto.createHmac('sha256', 'secret').update(raw).digest('hex');
  assert.equal(signVolkernPayload('secret', raw), expected);
});

test('non-2xx responses do not throw', async () => {
  const { db } = makeFakeDb();
  const capture = { calls: [] as FetchCall[] };
  const deps: VolkernDeps = { prisma: db, fetchImpl: makeFetch(capture, 500) };

  await dispatchVolkernBookingEvent(
    'user_1',
    'BOOKING_CREATED',
    {
      id: 'bk_6',
      guestName: 'Rosa',
      guestEmail: 'rosa@example.com',
      guestPhone: null,
      startTime: new Date('2026-09-14T10:00:00Z'),
      endTime: new Date('2026-09-14T11:00:00Z'),
      timezone: 'UTC',
      eventTypeName: 'Sesión',
    },
    undefined,
    deps,
  );

  assert.equal(capture.calls.length, 1);
});