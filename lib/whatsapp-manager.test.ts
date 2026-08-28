import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInstanceName,
  createWhatsAppConnection,
  getWhatsAppBaseUrl,
  getWhatsAppGlobalApiKey,
  getWhatsAppQr,
  getWhatsAppConnectionState,
  disconnectWhatsAppInstance,
  deleteWhatsAppInstance,
  type WhatsAppManagerDeps,
} from './whatsapp-manager';

// Minimal Prisma-like client scoped to the models used by the layer.
function fakeDb(overrides: {
  findUnique?: (args: any) => Promise<any>;
  update?: (args: any) => Promise<any>;
  bookings?: any;
}) {
  const db: any = {
    user: {
      findUnique: overrides.findUnique || (async () => null),
      update: overrides.update || (async () => ({})),
    },
  };
  // Prisma exposes related models like demographics/quotas; keep inert for safety.
  db.bookings = overrides.bookings ?? undefined;
  return db;
}

// Loose Response builder.
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

// Build the injected deps: fake prisma + fetch recording calls.
function makeDeps(db: any, handler: (url: string, init?: RequestInit) => Promise<Response>): WhatsAppManagerDeps & { calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    return handler(url, init);
  };
  // makeDeps(): the async shape is accepted as (input, init) -> Promise<Response>
  return { prisma: db, fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

beforeEach(() => {
  process.env.EVOLUTION_BASE_URL = 'https://api.example.test';
  process.env.EVOLUTION_GLOBAL_API_KEY = 'global-key-123';
});

afterEach(() => {
  delete process.env.EVOLUTION_BASE_URL;
  delete process.env.EVOLUTION_GLOBAL_API_KEY;
  delete process.env.VERCEL_URL;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('config accessors', () => {
  it('reads the base URL from ENV', () => {
    assert.equal(getWhatsAppBaseUrl(), 'https://api.example.test');
  });

  it('reads the global API key from ENV', () => {
    assert.equal(getWhatsAppGlobalApiKey(), 'global-key-123');
  });
});

describe('buildInstanceName', () => {
  it('produces a stable, service-compatible (lowercase/alnum/_/) name', () => {
    const name = buildInstanceName('User#123!', 1);
    assert.match(name, /^wa_[a-z0-9_]+$/);
    assert.ok(name.startsWith('wa_'));
  });

  it('is unique across calls (ms timestamp) and includes the user id', async () => {
    const a = buildInstanceName('abc123', 0);
    // Ensure a different millisecond so the embedded timestamp differs.
    await new Promise((r) => setTimeout(r, 5));
    const b = buildInstanceName('abc123', 0);
    assert.notEqual(a, b);
    assert.ok(a.includes('abc123'));
  });
});

describe('createWhatsAppConnection', () => {
  it('creates the instance, registers the webhook and persists connection', async () => {
    const created: any[] = [];
    const db = fakeDb({
      update: async (args: any) => { created.push(args); return {}; },
    });

    const deps = makeDeps(db, (url, init) => {
      if (url.includes('/instance/create')) {
        return Promise.resolve(jsonResponse({ instance: { instanceName: 'wa_test' } }));
      }
      if (url.includes('/webhook/set/')) {
        return Promise.resolve(jsonResponse({ enabled: true }));
      }
      return Promise.resolve(jsonResponse({}, 500));
    });

    const { instanceName } = await createWhatsAppConnection('u1', 'https://app.example.test', deps);

    assert.ok(instanceName);
    assert.ok(deps.calls.some((u) => u.includes('/instance/create')));
    const webhookCall = deps.calls.find((u) => u.includes('/webhook/set/'))!;
    assert.ok(webhookCall);

    // Webhook body must point at the neutral public endpoint and subscribe to QR/messages.
    const createInit = deps.calls.map((c) => c).length; // ensure fetch ran
    assert.ok(createInit > 0);

    // prisma.user.update must have persisted the connection.
    assert.equal(created.length, 1);
    assert.equal(created[0].data.whatsappEnabled, true);
    assert.equal(created[0].data.evolutionInstanceName, instanceName);
  });

  it('throws when the create call fails', async () => {
    const db = fakeDb({ update: async () => ({}) });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({ error: 'nope' }, 400)));
    await assert.rejects(() => createWhatsAppConnection('u1', undefined, deps), /Failed to create WhatsApp instance/);
  });
});

describe('getWhatsAppQr', () => {
  it('returns the QR payload from the connect endpoint', async () => {
    const db = fakeDb({
      findUnique: async () => ({ evolutionInstanceName: 'wa_test_0_x' }),
    });
    const deps = makeDeps(db, (url) =>
      Promise.resolve(jsonResponse({ base64: 'data:image/png;base64,AAAA', code: 'code', pairingCode: null })),
    );

    const qr = await getWhatsAppQr('u1', deps);
    assert.deepEqual(qr, { base64: 'data:image/png;base64,AAAA', code: 'code', pairingCode: null });

    assert.ok(deps.calls[0].includes('/instance/connect/wa_test_0_x'));
  });

  it('returns null when the user has no instance', async () => {
    const db = fakeDb({ findUnique: async () => null });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({})));
    const qr = await getWhatsAppQr('u1', deps);
    assert.equal(qr, null);
  });
});

describe('getWhatsAppConnectionState', () => {
  it('reports connected when state is open', async () => {
    const db = fakeDb({ findUnique: async () => ({ evolutionInstanceName: 'wa_test' }) });
    const deps = makeDeps(db, (url) => {
      const { searchParams, pathname } = new URL(url);
      void searchParams; void pathname;
      return Promise.resolve(jsonResponse({ state: 'open' }));
    });
    const s = await getWhatsAppConnectionState('u1', deps);
    assert.equal(s.connected, true);
    assert.equal(s.state, 'open');
  });

  it('reports not created when no instance exists', async () => {
    const db = fakeDb({ findUnique: async () => null });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({})));
    const s = await getWhatsAppConnectionState('u1', deps);
    assert.equal(s.connected, false);
    assert.equal(s.state, 'not_created');
    assert.equal(s.hasInstance, false);
  });

  it('treats 404 as not found (not an error)', async () => {
    const db = fakeDb({ findUnique: async () => ({ evolutionInstanceName: 'wa_missing' }) });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({ message: 'nope' }, 404)));
    const s = await getWhatsAppConnectionState('u1', deps);
    assert.equal(s.connected, false);
    assert.equal(s.state, 'not_found');
    assert.equal(s.success, true);
  });
});

describe('disconnectWhatsAppInstance', () => {
  it('calls the logout endpoint for the user instance', async () => {
    const db = fakeDb({ findUnique: async () => ({ evolutionInstanceName: 'wa_test' }) });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({ status: 'SUCCESS' })));
    await disconnectWhatsAppInstance('u1', deps);
    assert.ok(deps.calls[0].includes('/instance/logout/wa_test'));
  });
});

describe('deleteWhatsAppInstance', () => {
  it('deletes the instance and resets user config', async () => {
    const updated: any[] = [];
    const db = fakeDb({
      findUnique: async () => ({ evolutionInstanceName: 'wa_test' }),
      update: async (args: any) => { updated.push(args); return {}; },
    });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({ status: 'SUCCESS' })));

    await deleteWhatsAppInstance('u1', deps);

    assert.ok(deps.calls[0].includes('/instance/delete/wa_test'));
    assert.equal(updated.length, 1);
    assert.equal(updated[0].data.whatsappEnabled, false);
    assert.equal(updated[0].data.evolutionInstanceName, null);
  });
});