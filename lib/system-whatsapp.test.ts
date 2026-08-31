import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  SYSTEM_WHATSAPP_INSTANCE,
  activateSystemWhatsApp,
  getSystemWhatsAppConfig,
  getSystemWhatsAppQr,
  getSystemWhatsAppStatus,
  disconnectSystemWhatsApp,
  sendSystemWhatsAppMessage,
  sendSystemBookingConfirmation,
  notifyAdminWhatsApp,
  notifyAdminNewSignup,
  setSystemWhatsAppAdminPhone,
  type SystemWhatsAppDeps,
} from './system-whatsapp';

function fakeDb(overrides: {
  findUnique?: (args: any) => Promise<any>;
  upsert?: (args: any) => Promise<any>;
  create?: (args: any) => Promise<any>;
  findFirst?: (args: any) => Promise<any>;
}) {
  const db: any = {
    systemSetting: {
      findUnique: overrides.findUnique || (async () => null),
      upsert: overrides.upsert || (async () => ({})),
    },
    whatsAppMessage: {
      create: overrides.create || (async () => ({})),
    },
    user: {
      findFirst: overrides.findFirst || (async () => null),
    },
  };
  return db;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

function makeDeps(db: any, handler: (url: string, init?: RequestInit) => Promise<Response>): SystemWhatsAppDeps & { calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    return handler(url, init);
  };
  return { prisma: db, fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

function storedConfig(overrides: Partial<any> = {}) {
  return {
    key: 'system_whatsapp',
    value: {
      instanceName: SYSTEM_WHATSAPP_INSTANCE,
      enabled: true,
      phone: null,
      connectedAt: null,
      updatedBy: null,
      ...overrides,
    },
  };
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

describe('activateSystemWhatsApp', () => {
  it('creates the exclusive Anytimebot instance and persists the config', async () => {
    const upserted: any[] = [];
    const db = fakeDb({ upsert: async (args: any) => { upserted.push(args); return {}; } });
    const deps = makeDeps(db, (url) => {
      if (url.includes('/instance/create')) return Promise.resolve(jsonResponse({ instance: { instanceName: SYSTEM_WHATSAPP_INSTANCE } }));
      if (url.includes('/webhook/set/')) return Promise.resolve(jsonResponse({ enabled: true }));
      return Promise.resolve(jsonResponse({}, 500));
    });

    const { instanceName } = await activateSystemWhatsApp('https://app.example.test', 'admin@example.test', deps);

    assert.equal(instanceName, SYSTEM_WHATSAPP_INSTANCE);
    assert.ok(deps.calls.some((u) => u.includes('/instance/create')));
    assert.ok(deps.calls.some((u) => u.includes('/webhook/set/')));
    assert.equal(upserted.length, 1);
    assert.equal(upserted[0].where.key, 'system_whatsapp');
    assert.equal(upserted[0].create.value.enabled, true);
    assert.equal(upserted[0].create.value.instanceName, SYSTEM_WHATSAPP_INSTANCE);
  });

  it('throws when the messaging service is not configured', async () => {
    delete process.env.EVOLUTION_BASE_URL;
    const db = fakeDb({});
    await assert.rejects(() => activateSystemWhatsApp(undefined, null, db as any), /not configured/);
  });
});

describe('getSystemWhatsAppConfig', () => {
  it('returns null when never configured', async () => {
    const db = fakeDb({ findUnique: async () => null });
    const config = await getSystemWhatsAppConfig({ prisma: db } as any);
    assert.equal(config, null);
  });

  it('returns the persisted config', async () => {
    const db = fakeDb({ findUnique: async () => storedConfig({ phone: '+34600111222' }) });
    const config = await getSystemWhatsAppConfig({ prisma: db } as any);
    assert.equal(config?.instanceName, SYSTEM_WHATSAPP_INSTANCE);
    assert.equal(config?.phone, '+34600111222');
  });
});

describe('getSystemWhatsAppQr', () => {
  it('returns the QR payload from the connect endpoint', async () => {
    const db = fakeDb({ findUnique: async () => storedConfig() });
    const deps = makeDeps(db, (url) =>
      Promise.resolve(jsonResponse({ base64: 'data:image/png;base64,AAAA', code: 'code', pairingCode: null })),
    );
    const qr = await getSystemWhatsAppQr(deps);
    assert.deepEqual(qr, { base64: 'data:image/png;base64,AAAA', code: 'code', pairingCode: null });
    assert.ok(deps.calls[0].includes(`/instance/connect/${SYSTEM_WHATSAPP_INSTANCE}`));
  });

  it('returns null when the system number is not configured', async () => {
    const db = fakeDb({ findUnique: async () => null });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({})));
    const qr = await getSystemWhatsAppQr(deps);
    assert.equal(qr, null);
  });
});

describe('getSystemWhatsAppStatus', () => {
  it('reports not configured when never activated', async () => {
    const db = fakeDb({ findUnique: async () => null });
    const s = await getSystemWhatsAppStatus({ prisma: db } as any);
    assert.equal(s.connected, false);
    assert.equal(s.state, 'not_configured');
    assert.equal(s.configured, false);
  });

  it('reports connected when state is open and discovers the phone', async () => {
    const upserted: any[] = [];
    const db = fakeDb({
      findUnique: async () => storedConfig(),
      upsert: async (args: any) => { upserted.push(args); return {}; },
    });
    const deps = makeDeps(db, (url) => {
      if (url.includes('/instance/connectionState/')) return Promise.resolve(jsonResponse({ state: 'open' }));
      if (url.includes('/instance/fetchInstances')) {
        return Promise.resolve(jsonResponse([{ instanceName: SYSTEM_WHATSAPP_INSTANCE, ownerJid: '34600111222@s.whatsapp.net' }]));
      }
      return Promise.resolve(jsonResponse({}, 500));
    });

    const s = await getSystemWhatsAppStatus(deps);
    assert.equal(s.connected, true);
    assert.equal(s.state, 'open');
    assert.equal(s.phone, '34600111222');
  });

  it('treats 404 as not found', async () => {
    const db = fakeDb({ findUnique: async () => storedConfig() });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({ message: 'nope' }, 404)));
    const s = await getSystemWhatsAppStatus(deps);
    assert.equal(s.connected, false);
    assert.equal(s.state, 'not_found');
  });
});

describe('disconnectSystemWhatsApp', () => {
  it('logs out without deleting when permanent=false', async () => {
    const db = fakeDb({ findUnique: async () => storedConfig() });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({ status: 'SUCCESS' })));
    await disconnectSystemWhatsApp(false, deps);
    assert.ok(deps.calls[0].includes(`/instance/logout/${SYSTEM_WHATSAPP_INSTANCE}`));
  });

  it('deletes and disables the config when permanent=true', async () => {
    const upserted: any[] = [];
    const db = fakeDb({
      findUnique: async () => storedConfig(),
      upsert: async (args: any) => { upserted.push(args); return {}; },
    });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({ status: 'SUCCESS' })));
    await disconnectSystemWhatsApp(true, deps);
    assert.ok(deps.calls[0].includes(`/instance/delete/${SYSTEM_WHATSAPP_INSTANCE}`));
    assert.equal(upserted.length, 1);
    assert.equal(upserted[0].update.value.enabled, false);
  });
});

describe('sendSystemWhatsAppMessage', () => {
  it('sends via the sendText endpoint and persists the message without a tenant owner', async () => {
    const created: any[] = [];
    const db = fakeDb({
      findUnique: async () => storedConfig(),
      create: async (args: any) => { created.push(args); return {}; },
    });
    const deps = makeDeps(db, (url) => {
      if (url.includes('/message/sendText/')) {
        return Promise.resolve(jsonResponse({ key: { id: 'msg-1' } }));
      }
      return Promise.resolve(jsonResponse({}, 500));
    });

    const ok = await sendSystemWhatsAppMessage('+34 600 111 222', 'Hola', 'bk-1', deps);

    assert.equal(ok, true);
    const sendCall = deps.calls.find((u) => u.includes('/message/sendText/'))!;
    assert.ok(sendCall.includes(`/message/sendText/${SYSTEM_WHATSAPP_INSTANCE}`));
    assert.equal(created.length, 1);
    assert.equal(created[0].data.userId, null);
    assert.equal(created[0].data.bookingId, 'bk-1');
    assert.equal(created[0].data.phone, '+34 600 111 222');
  });

  it('returns false when the system number is not configured', async () => {
    const db = fakeDb({ findUnique: async () => null });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({}, 500)));
    const ok = await sendSystemWhatsAppMessage('+34600111222', 'Hola', undefined, deps);
    assert.equal(ok, false);
    assert.equal(deps.calls.length, 0);
  });

  it('returns false when the send fails', async () => {
    const db = fakeDb({ findUnique: async () => storedConfig() });
    const deps = makeDeps(db, () => Promise.resolve(jsonResponse({ error: 'nope' }, 400)));
    const ok = await sendSystemWhatsAppMessage('+34600111222', 'Hola', undefined, deps);
    assert.equal(ok, false);
  });
});

describe('setSystemWhatsAppAdminPhone', () => {
  it('persists the admin notification phone', async () => {
    const upserted: any[] = [];
    const db = fakeDb({
      findUnique: async () => storedConfig(),
      upsert: async (args: any) => { upserted.push(args); return {}; },
    });
    await setSystemWhatsAppAdminPhone('+34600111222', { prisma: db } as any);
    assert.equal(upserted.length, 1);
    assert.equal(upserted[0].update.value.adminPhone, '+34600111222');
  });
});

describe('notifyAdminWhatsApp', () => {
  it('sends to the configured adminPhone', async () => {
    const created: any[] = [];
    const db = fakeDb({
      findUnique: async () => storedConfig({ adminPhone: '+34600999000' }),
      create: async (args: any) => { created.push(args); return {}; },
    });
    const deps = makeDeps(db, (url) => {
      if (url.includes('/message/sendText/')) return Promise.resolve(jsonResponse({ key: { id: 'm1' } }));
      return Promise.resolve(jsonResponse({}, 500));
    });

    const ok = await notifyAdminWhatsApp('Aviso de prueba', deps);
    assert.equal(ok, true);
    assert.equal(created[0].data.phone, '+34600999000');
  });

  it('falls back to the ADMIN user phone when no adminPhone is set', async () => {
    const db = fakeDb({
      findUnique: async () => storedConfig(),
      findFirst: async () => ({ phone: '+34600555000' }),
    });
    const deps = makeDeps(db, (url) => {
      if (url.includes('/message/sendText/')) return Promise.resolve(jsonResponse({ key: { id: 'm1' } }));
      return Promise.resolve(jsonResponse({}, 500));
    });

    const ok = await notifyAdminWhatsApp('Aviso', deps);
    assert.equal(ok, true);
    assert.ok(deps.calls.some((u) => u.includes('/message/sendText/')));
  });

  it('returns false when no destination phone is available', async () => {
    const db = fakeDb({ findUnique: async () => storedConfig({ phone: null }) });
    const ok = await notifyAdminWhatsApp('Aviso', { prisma: db } as any);
    assert.equal(ok, false);
  });
});

describe('notifyAdminNewSignup', () => {
  it('builds and sends a new-signup message', async () => {
    const created: any[] = [];
    const db = fakeDb({
      findUnique: async () => storedConfig({ adminPhone: '+34600111222' }),
      create: async (args: any) => { created.push(args); return {}; },
    });
    const deps = makeDeps(db, (url) => {
      if (url.includes('/message/sendText/')) return Promise.resolve(jsonResponse({ key: { id: 'm1' } }));
      return Promise.resolve(jsonResponse({}, 500));
    });

    const ok = await notifyAdminNewSignup({ name: 'Ana', email: 'ana@example.test', username: 'ana' }, deps);
    assert.equal(ok, true);
    assert.ok(created[0].data.message.includes('ana@example.test'));
    assert.ok(created[0].data.message.includes('Ana'));
  });
});

describe('sendSystemBookingConfirmation', () => {
  it('builds and sends a confirmation from the system number', async () => {
    const created: any[] = [];
    const db = fakeDb({
      findUnique: async () => storedConfig(),
      create: async (args: any) => { created.push(args); return {}; },
    });
    const deps = makeDeps(db, (url) => {
      if (url.includes('/message/sendText/')) return Promise.resolve(jsonResponse({ key: { id: 'msg-1' } }));
      return Promise.resolve(jsonResponse({}, 500));
    });

    const ok = await sendSystemBookingConfirmation(
      '+34600111222',
      { guestName: 'Ana', eventTypeName: 'Consulta', startTime: '01/09/2026 10:00', timezone: 'Europe/Madrid' },
      deps,
    );

    assert.equal(ok, true);
    assert.ok(created[0].data.message.includes('Ana'));
    assert.ok(created[0].data.message.includes('Consulta'));
  });
});
