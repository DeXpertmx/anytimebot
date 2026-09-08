/**
 * Tests for lib/twilio-whatsapp.ts (node:test + tsx, no network, no real DB).
 * Verifies the Twilio-only contract of WhatsApp marketing sends:
 *  - refuses to send when Twilio is not configured (never falls back to Evolution)
 *  - sends via the Twilio REST API with whatsapp: prefixed numbers
 *  - logs the outbound message with provider 'twilio'
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { sendTwilioWhatsAppMessage, getTwilioConfig } from './twilio-whatsapp';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeDb(user: Record<string, unknown> | null) {
  const created: any[] = [];
  return {
    db: {
      user: {
        findUnique: async () => (user ? { ...user } : null),
      },
      whatsAppMessage: {
        create: async ({ data }: { data: any }) => {
          created.push(data);
          return data;
        },
      },
    },
    created,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const twilioUser = {
  id: 'u1',
  twilioAccountSid: 'AC123',
  twilioAuthToken: 'secret-token',
  twilioPhoneNumber: '+34600111222',
};

// ---------------------------------------------------------------------------
// getTwilioConfig
// ---------------------------------------------------------------------------

describe('getTwilioConfig', () => {
  test('reports configured when all three credentials exist', async () => {
    const { db } = makeDb(twilioUser);
    const cfg = await getTwilioConfig('u1', { prisma: db as any });
    assert.equal(cfg.configured, true);
    assert.equal(cfg.accountSid, 'AC123');
    assert.equal(cfg.phoneNumber, '+34600111222');
  });

  test('reports not configured when the auth token is missing', async () => {
    const { db } = makeDb({ ...twilioUser, twilioAuthToken: null });
    const cfg = await getTwilioConfig('u1', { prisma: db as any });
    assert.equal(cfg.configured, false);
  });

  test('reports not configured for an unknown user', async () => {
    const { db } = makeDb(null);
    const cfg = await getTwilioConfig('nobody', { prisma: db as any });
    assert.equal(cfg.configured, false);
  });
});

// ---------------------------------------------------------------------------
// sendTwilioWhatsAppMessage
// ---------------------------------------------------------------------------

describe('sendTwilioWhatsAppMessage', () => {
  beforeEach(() => {
    process.env.TWILIO_TEST_GUARD = '1';
  });

  test('refuses to send (and never calls Evolution) when Twilio is not configured', async () => {
    const { db, created } = makeDb({ ...twilioUser, twilioAuthToken: null });
    let fetchCalled = 0;
    const ok = await sendTwilioWhatsAppMessage('u1', '+34600999888', 'hola', {
      prisma: db as any,
      fetchImpl: (async () => {
        fetchCalled++;
        return jsonResponse({ sid: 'SM1' });
      }) as any,
    });
    assert.equal(ok, false);
    assert.equal(fetchCalled, 0); // no provider call at all
    assert.equal(created.length, 0); // nothing logged as sent
  });

  test('sends via the Twilio REST API with whatsapp: numbers and logs provider twilio', async () => {
    const { db, created } = makeDb(twilioUser);
    let capturedUrl = '';
    let capturedAuth = '';
    const ok = await sendTwilioWhatsAppMessage('u1', '600999888', 'hola', {
      prisma: db as any,
      fetchImpl: (async (url: string, init: any) => {
        capturedUrl = url;
        capturedAuth = init.headers['Authorization'];
        return jsonResponse({ sid: 'SM123' });
      }) as any,
    });
    assert.equal(ok, true);
    assert.ok(capturedUrl.includes('api.twilio.com/2010-04-01/Accounts/AC123/Messages.json'));
    assert.ok(capturedAuth.startsWith('Basic '));
    // credentials round-trip: base64(AC123:secret-token)
    assert.equal(
      capturedAuth,
      `Basic ${Buffer.from('AC123:secret-token').toString('base64')}`,
    );
    assert.equal(created.length, 1);
    assert.equal(created[0].provider, 'twilio');
    assert.equal(created[0].status, 'SENT');
    assert.equal(created[0].phone, 'whatsapp:600999888');
  });

  test('returns false when the Twilio API rejects and does not log a send', async () => {
    const { db, created } = makeDb(twilioUser);
    const ok = await sendTwilioWhatsAppMessage('u1', '+34600999888', 'hola', {
      prisma: db as any,
      fetchImpl: (async () => jsonResponse({ message: 'queue full' }, 429)) as any,
    });
    assert.equal(ok, false);
    assert.equal(created.length, 0);
  });

  test('returns false when the network call throws', async () => {
    const { db, created } = makeDb(twilioUser);
    const ok = await sendTwilioWhatsAppMessage('u1', '+34600999888', 'hola', {
      prisma: db as any,
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as any,
    });
    assert.equal(ok, false);
    assert.equal(created.length, 0);
  });
});
