/**
 * Tests for the outgoing webhook dispatcher (lib/webhooks.ts).
 *
 * Runs with node:test + tsx. Uses the project's dependency-injection pattern
 * (same as lib/whatsapp-manager.test.ts): a fake prisma client and a
 * programmable fetch double are passed into each call — no module mocking,
 * no real network, no sleeps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dispatchWebhookEvent,
  deliverWebhook,
  processWebhookRetries,
  signPayload,
  verifySignature,
  generateWebhookSecret,
  buildBookingPayload,
  WEBHOOK_EVENTS,
  type WebhookDeps,
} from './webhooks';

// ---------------------------------------------------------------------------
// Fake prisma client (only the webhook models)
// ---------------------------------------------------------------------------

interface FakeDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  payload: unknown;
  status: string;
  attempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextRetryAt: Date | null;
  deliveredAt: Date | null;
  createdAt: Date;
}

interface FakeEndpoint {
  id: string;
  userId: string;
  url: string;
  secret: string;
  events: string;
  active: boolean;
}

function makeFakeDb() {
  const endpoints: FakeEndpoint[] = [];
  const deliveries: FakeDelivery[] = [];
  let seq = 0;
  const nextId = () => `id_${++seq}`;

  const db: any = {
    webhookEndpoint: {
      findMany: async (args: any = {}) =>
        endpoints.filter((e) => {
          if (args.where?.userId && e.userId !== args.where.userId) return false;
          if (args.where?.active === true && !e.active) return false;
          const or = args.where?.OR;
          if (or) {
            const match = or.some((cond: any) =>
              cond.events === '*'
                ? e.events === '*'
                : typeof cond.events?.contains === 'string' && e.events.includes(cond.events.contains),
            );
            if (!match) return false;
          }
          return true;
        }),
    },
    webhookDelivery: {
      create: async ({ data }: any) => {
        const rec: FakeDelivery = {
          id: nextId(),
          endpointId: data.endpointId,
          eventType: data.eventType,
          payload: data.payload,
          status: 'PENDING',
          attempts: 0,
          responseStatus: null,
          lastError: null,
          nextRetryAt: null,
          deliveredAt: null,
          createdAt: new Date(),
        };
        deliveries.push(rec);
        return { id: rec.id };
      },
      findUnique: async ({ where, include }: any) => {
        const rec = deliveries.find((d) => d.id === where.id);
        if (!rec) return null;
        if (include?.endpoint) {
          return { ...rec, endpoint: { ...endpoints.find((e) => e.id === rec.endpointId) } };
        }
        return rec;
      },
      update: async ({ where, data }: any) => {
        const rec = deliveries.find((d) => d.id === where.id);
        if (!rec) throw new Error('delivery not found');
        Object.assign(rec, data);
        return rec;
      },
      findMany: async (args: any = {}) =>
        deliveries.filter((d) => {
          if (args.where?.status && d.status !== args.where.status) return false;
          const lte = args.where?.nextRetryAt?.lte;
          if (lte && (!d.nextRetryAt || d.nextRetryAt > lte)) return false;
          return true;
        }),
    },
  };

  return {
    db,
    endpoints,
    deliveries,
    seedEndpoint(overrides: Partial<FakeEndpoint> = {}): FakeEndpoint {
      const ep: FakeEndpoint = {
        id: nextId(),
        userId: 'user_1',
        url: 'https://externa.example/webhooks',
        secret: generateWebhookSecret(),
        events: '*',
        active: true,
        ...overrides,
      };
      endpoints.push(ep);
      return ep;
    },
  };
}

// ---------------------------------------------------------------------------
// Programmable fetch double
// ---------------------------------------------------------------------------

type FetchResponse = { status: number; text?: () => Promise<string> };
type FetchCall = { url: string; init: any };

function makeFetchDouble() {
  const calls: FetchCall[] = [];
  let impl: (url: string, init: any) => Promise<FetchResponse> = async () => ({ status: 200 });
  const fetchImpl = (async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return impl(String(url), init);
  }) as any;
  return {
    calls,
    fetchImpl,
    set(implementation: (url: string, init: any) => Promise<FetchResponse>) {
      impl = implementation;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const sampleBooking = {
  id: 'bk_1',
  guestName: 'Ana',
  guestEmail: 'ana@example.com',
  guestPhone: null,
  startTime: new Date('2026-09-10T09:00:00Z'),
  endTime: new Date('2026-09-10T09:30:00Z'),
  timezone: 'Europe/Madrid',
  status: 'CONFIRMED',
  eventType: {
    id: 'et_1',
    name: 'Consulta',
    duration: 30,
    location: 'video',
    bookingPage: { id: 'bp_1', title: 'Mi página', slug: 'juan', userId: 'user_1' },
  },
};

function makeDeps(): { deps: WebhookDeps } & ReturnType<typeof makeFakeDb> & ReturnType<typeof makeFetchDouble> {
  const fakeDb = makeFakeDb();
  const fakeFetch = makeFetchDouble();
  return { ...fakeDb, ...fakeFetch, deps: { prisma: fakeDb.db as any, fetchImpl: fakeFetch.fetchImpl } };
}

/**
 * Creates a delivery directly, bypassing the dispatcher. deliverWebhook-level
 * tests use this to stay deterministic: dispatchWebhookEvent fires deliveries
 * in the background, which would race with test mutations.
 */
async function seedDelivery(
  ctx: ReturnType<typeof makeDeps>,
  endpointId: string,
  event: (typeof WEBHOOK_EVENTS)[number] = 'booking.created',
) {
  await ctx.db.webhookDelivery.create({
    data: {
      endpointId,
      eventType: event,
      payload: buildBookingPayload(event, sampleBooking),
    },
  });
}

/** Flushes background microtasks (the dispatcher's fire-and-forget pass). */
const flush = () => new Promise((r) => setImmediate(r));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('dispatcher delivers on 2xx and records status, attempts and responseStatus', async () => {
  const ctx = makeDeps();
  const ep = ctx.seedEndpoint();
  await seedDelivery(ctx, ep.id);

  const result = await deliverWebhook(ctx.deliveries[0].id, ctx.deps);
  assert.equal(result, 'DELIVERED');

  const d = ctx.deliveries[0];
  assert.equal(d.status, 'DELIVERED');
  assert.equal(d.attempts, 1);
  assert.equal(d.responseStatus, 200);
  assert.ok(d.deliveredAt instanceof Date);
  assert.equal(d.nextRetryAt, null);
  assert.equal(ctx.calls[0].url, ep.url);
});

test('request is signed and carries event + delivery headers', async () => {
  const ctx = makeDeps();
  const ep = ctx.seedEndpoint();
  await seedDelivery(ctx, ep.id, 'booking.cancelled');

  await deliverWebhook(ctx.deliveries[0].id, ctx.deps);

  const init = ctx.calls[0].init;
  const rawBody: string = init.body;
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.equal(init.headers['X-Anytimebot-Event'], 'booking.cancelled');
  assert.ok(init.headers['X-Anytimebot-Delivery-Id']);
  assert.equal(init.headers['X-Anytimebot-Signature'], signPayload(ep.secret, rawBody));
  // Signature must verify against the raw body exactly as a receiver would.
  assert.ok(verifySignature(ep.secret, rawBody, init.headers['X-Anytimebot-Signature']));
  assert.equal(verifySignature('otro_secreto', rawBody, init.headers['X-Anytimebot-Signature']), false);
});

test('HTTP 500 schedules a retry with exponential backoff', async () => {
  const ctx = makeDeps();
  const ep = ctx.seedEndpoint();
  await seedDelivery(ctx, ep.id);
  ctx.set(async () => ({ status: 500, text: async () => 'boom' }));

  await deliverWebhook(ctx.deliveries[0].id, ctx.deps);

  const d = ctx.deliveries[0];
  assert.equal(d.status, 'PENDING'); // not terminal yet
  assert.equal(d.attempts, 1);
  assert.equal(d.responseStatus, 500);
  assert.ok(d.lastError!.startsWith('HTTP 500'));
  // Attempt 1 -> next retry within ~1 minute
  const deltaMs = d.nextRetryAt!.getTime() - Date.now();
  assert.ok(deltaMs > 0 && deltaMs <= 60_000, `expected <= 60s, got ${deltaMs}ms`);
});

test('network error schedules a retry and records the message', async () => {
  const ctx = makeDeps();
  const ep = ctx.seedEndpoint();
  await seedDelivery(ctx, ep.id);
  ctx.set(async () => {
    throw new Error('ECONNREFUSED');
  });

  await deliverWebhook(ctx.deliveries[0].id, ctx.deps);

  const d = ctx.deliveries[0];
  assert.equal(d.status, 'PENDING');
  assert.equal(d.lastError, 'ECONNREFUSED');
  assert.equal(d.responseStatus, null);
});

test('reaching MAX_ATTEMPTS marks the delivery FAILED and clears the retry date', async () => {
  const ctx = makeDeps();
  const ep = ctx.seedEndpoint();
  await seedDelivery(ctx, ep.id);
  ctx.set(async () => ({ status: 500, text: async () => 'nope' }));

  const d = ctx.deliveries[0];

  for (let i = 1; i <= 5; i++) {
    await deliverWebhook(d.id, ctx.deps);
  }
  assert.equal(d.attempts, 5);
  assert.equal(d.status, 'FAILED');
  assert.equal(d.nextRetryAt, null);
});

test('fan-out skips inactive endpoints and filters by subscribed events', async () => {
  const ctx = makeDeps();
  ctx.seedEndpoint({ id: 'ep_on', events: 'booking.cancelled,booking.created' });
  ctx.seedEndpoint({ id: 'ep_off', active: false });
  ctx.seedEndpoint({ id: 'ep_other', events: 'booking.completed' });

  await dispatchWebhookEvent('user_1', 'booking.cancelled', buildBookingPayload('booking.cancelled', sampleBooking), ctx.deps);
  await flush();

  const targets = ctx.deliveries.map((d) => d.endpointId);
  assert.deepEqual(targets, ['ep_on']);
  assert.equal(ctx.deliveries[0].status, 'DELIVERED');
});

test('fan-out never crosses accounts', async () => {
  const ctx = makeDeps();
  ctx.seedEndpoint({ userId: 'user_1' });

  await dispatchWebhookEvent('user_2', 'booking.created', buildBookingPayload('booking.created', sampleBooking), ctx.deps);
  assert.equal(ctx.deliveries.length, 0);
});

test('disabled endpoint marks its pending deliveries FAILED without HTTP call', async () => {
  const ctx = makeDeps();
  const ep = ctx.seedEndpoint();
  await seedDelivery(ctx, ep.id);

  ep.active = false;
  const result = await deliverWebhook(ctx.deliveries[0].id, ctx.deps);

  assert.equal(result, 'FAILED');
  assert.equal(ctx.deliveries[0].status, 'FAILED');
  assert.equal(ctx.deliveries[0].lastError, 'Endpoint disabled');
  assert.equal(ctx.calls.length, 0);
});

test('cron retry processes only due PENDING deliveries and reports counts', async () => {
  const ctx = makeDeps();
  const ep = ctx.seedEndpoint();
  await seedDelivery(ctx, ep.id, 'booking.created');
  await seedDelivery(ctx, ep.id, 'booking.confirmed');

  ctx.set(async () => ({ status: 500, text: async () => 'x' }));
  await deliverWebhook(ctx.deliveries[0].id, ctx.deps);
  await deliverWebhook(ctx.deliveries[1].id, ctx.deps);
  assert.equal(ctx.deliveries.filter((d) => d.status === 'PENDING').length, 2);

  // Force one to be due now and the other to be due later.
  ctx.deliveries[0].nextRetryAt = new Date(Date.now() - 60_000);
  ctx.deliveries[1].nextRetryAt = new Date(Date.now() + 600_000);

  ctx.set(async () => ({ status: 200 }));
  const fakeRequest = {
    headers: { get: (k: string) => (k === 'authorization' ? 'Bearer test-secret' : null) },
  };
  const realEnv = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';
  try {
    const res = await processWebhookRetries(fakeRequest as any, ctx.deps);
    const body = await res.json();
    assert.equal(body.processed, 1);
    assert.equal(body.delivered, 1);
    assert.equal(ctx.deliveries[0].status, 'DELIVERED');
    assert.equal(ctx.deliveries[1].status, 'PENDING'); // not due yet, untouched
  } finally {
    process.env.CRON_SECRET = realEnv;
  }
});

test('cron rejects requests without a valid CRON_SECRET', async () => {
  const ctx = makeDeps();
  const fakeRequest = {
    headers: { get: (k: string) => (k === 'authorization' ? 'Bearer wrong' : null) },
  };
  const realEnv = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';
  try {
    const res = await processWebhookRetries(fakeRequest as any, ctx.deps);
    assert.equal(res.status, 401);
  } finally {
    process.env.CRON_SECRET = realEnv;
  }
});

test('payload matches the receiver-facing schema, including payment info', async () => {
  const ctx = makeDeps();
  const ep = ctx.seedEndpoint();
  ctx.set(async () => ({ status: 200 }));

  const paidBooking = {
    ...sampleBooking,
    paymentStatus: 'PAID',
    paymentAmount: 2500,
    paymentCurrency: 'eur',
  };
  await ctx.db.webhookDelivery.create({
    data: {
      endpointId: ep.id,
      eventType: 'booking.completed',
      payload: buildBookingPayload('booking.completed', paidBooking),
    },
  });
  await deliverWebhook(ctx.deliveries[0].id, ctx.deps);

  const payload = JSON.parse(ctx.calls[0].init.body);
  assert.equal(payload.event, 'booking.completed');
  assert.ok(payload.created_at);
  assert.equal(payload.data.id, 'bk_1');
  assert.equal(payload.data.status, 'CONFIRMED');
  assert.equal(payload.data.guest.email, 'ana@example.com');
  assert.equal(payload.data.event_type.name, 'Consulta');
  assert.equal(payload.data.booking_page.slug, 'juan');
  assert.deepEqual(payload.data.payment, { status: 'PAID', amount_cents: 2500, currency: 'eur' });
  assert.equal(new Date(payload.data.start_time).toISOString(), '2026-09-10T09:00:00.000Z');
});

test('dispatch never throws even when the database fails', async () => {
  const ctx = makeDeps();
  ctx.seedEndpoint();
  const originalCreate = ctx.db.webhookDelivery.create;
  ctx.db.webhookDelivery.create = async () => {
    throw new Error('db down');
  };
  try {
    await assert.doesNotReject(() =>
      dispatchWebhookEvent('user_1', 'booking.created', buildBookingPayload('booking.created', sampleBooking), ctx.deps),
    );
  } finally {
    ctx.db.webhookDelivery.create = originalCreate;
  }
});

test('WEBHOOK_EVENTS covers the five booking lifecycle events', () => {
  assert.deepEqual([...WEBHOOK_EVENTS], [
    'booking.created',
    'booking.confirmed',
    'booking.cancelled',
    'booking.completed',
    'booking.rescheduled',
  ]);
});
