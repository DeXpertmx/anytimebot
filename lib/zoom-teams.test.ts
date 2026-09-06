/**
 * Tests for the Zoom / Teams integration helpers (pure functions only —
 * no network, no database).
 */
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  zoomCredentials,
  zoomAccountCredentials,
  getZoomS2sHost,
  buildZoomAuthorizeUrl,
  buildZoomMeetingPayload,
} from './zoom';
import {
  teamsCredentials,
  buildTeamsAuthorizeUrl,
  buildTeamsMeetingPayload,
  TEAMS_SCOPES,
} from './teams';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('zoomCredentials / teamsCredentials', () => {
  test('return null when env vars are missing', () => {
    delete process.env.ZOOM_CLIENT_ID;
    delete process.env.ZOOM_CLIENT_SECRET;
    assert.equal(zoomCredentials(), null);
    delete process.env.TEAMS_CLIENT_ID;
    delete process.env.TEAMS_CLIENT_SECRET;
    delete process.env.TEAMS_TENANT_ID;
    assert.equal(teamsCredentials(), null);
  });

  test('read credentials from env', () => {
    process.env.ZOOM_CLIENT_ID = 'zoom-id';
    process.env.ZOOM_CLIENT_SECRET = 'zoom-secret';
    assert.deepEqual(zoomCredentials(), { clientId: 'zoom-id', clientSecret: 'zoom-secret' });

    process.env.TEAMS_CLIENT_ID = 'ms-id';
    process.env.TEAMS_CLIENT_SECRET = 'ms-secret';
    process.env.TEAMS_TENANT_ID = 'ms-tenant';
    assert.deepEqual(teamsCredentials(), {
      clientId: 'ms-id',
      clientSecret: 'ms-secret',
      tenantId: 'ms-tenant',
    });
  });
});

describe('zoomAccountCredentials (Server-to-Server mode)', () => {
  test('returns null when the account id is missing', () => {
    process.env.ZOOM_CLIENT_ID = 'zoom-id';
    process.env.ZOOM_CLIENT_SECRET = 'zoom-secret';
    delete process.env.ZOOM_ACCOUNT_ID;
    assert.equal(zoomAccountCredentials(), null);
  });

  test('returns null when only some variables are present', () => {
    process.env.ZOOM_ACCOUNT_ID = 'acc-1';
    delete process.env.ZOOM_CLIENT_ID;
    process.env.ZOOM_CLIENT_SECRET = 'zoom-secret';
    assert.equal(zoomAccountCredentials(), null);
  });

  test('reads account id + client id + secret from env', () => {
    process.env.ZOOM_ACCOUNT_ID = 'acc-1';
    process.env.ZOOM_CLIENT_ID = 'zoom-id';
    process.env.ZOOM_CLIENT_SECRET = 'zoom-secret';
    assert.deepEqual(zoomAccountCredentials(), {
      accountId: 'acc-1',
      clientId: 'zoom-id',
      clientSecret: 'zoom-secret',
    });
  });
});

describe('getZoomS2sHost', () => {
  test('uses ZOOM_HOST_EMAIL without any network call', async () => {
    process.env.ZOOM_HOST_EMAIL = 'host@example.com';
    const host = await getZoomS2sHost();
    assert.deepEqual(host, { userId: 'host@example.com', email: 'host@example.com' });
  });

  test('rejects when no host email is configured and no account credentials exist', async () => {
    delete process.env.ZOOM_HOST_EMAIL;
    delete process.env.ZOOM_ACCOUNT_ID;
    await assert.rejects(() => getZoomS2sHost(), /not configured/);
  });
});

describe('buildZoomAuthorizeUrl', () => {
  test('throws when the app is not configured', () => {
    delete process.env.ZOOM_CLIENT_ID;
    assert.throws(() => buildZoomAuthorizeUrl('https://app/cb', 'state-1'));
  });

  test('builds a consent URL with client, redirect, scope and state', () => {
    process.env.ZOOM_CLIENT_ID = 'zoom-id';
    process.env.ZOOM_CLIENT_SECRET = 'zoom-secret';
    const url = buildZoomAuthorizeUrl('https://app/cb', 'state-123');
    assert.ok(url.startsWith('https://zoom.us/oauth/authorize?'));
    assert.ok(url.includes('client_id=zoom-id'));
    assert.ok(url.includes('redirect_uri=https%3A%2F%2Fapp%2Fcb'));
    assert.ok(url.includes('response_type=code'));
    assert.ok(url.includes('state=state-123'));
    assert.ok(url.includes('meeting%3Awrite'));
  });
});

describe('buildZoomMeetingPayload', () => {
  test('formats start time, duration, timezone and settings', () => {
    const start = new Date('2026-10-05T14:30:00.000Z');
    const payload = buildZoomMeetingPayload({
      topic: 'Consulta',
      startTime: start,
      duration: 45,
      timezone: 'Europe/Madrid',
      agenda: 'Reunión con Ana',
    }) as any;
    assert.equal(payload.type, 2);
    assert.equal(payload.start_time, '2026-10-05 14:30:00');
    assert.equal(payload.duration, 45);
    assert.equal(payload.timezone, 'Europe/Madrid');
    assert.equal(payload.agenda, 'Reunión con Ana');
    assert.equal(payload.settings.waiting_room, true);
    assert.equal(payload.settings.join_before_host, false);
    assert.equal(payload.settings.auto_recording, 'cloud');
  });
});

describe('buildTeamsAuthorizeUrl', () => {
  test('throws when the app is not configured', () => {
    delete process.env.TEAMS_CLIENT_ID;
    assert.throws(() => buildTeamsAuthorizeUrl('https://app/cb', 'state-1'));
  });

  test('builds a Microsoft consent URL with scopes and state', () => {
    process.env.TEAMS_CLIENT_ID = 'ms-id';
    process.env.TEAMS_CLIENT_SECRET = 'ms-secret';
    process.env.TEAMS_TENANT_ID = 'ms-tenant';
    const url = buildTeamsAuthorizeUrl('https://app/cb', 'state-456');
    assert.ok(url.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?'));
    assert.ok(url.includes('client_id=ms-id'));
    assert.ok(url.includes('redirect_uri=https%3A%2F%2Fapp%2Fcb'));
    assert.ok(url.includes('state=state-456'));
    for (const scope of ['Calendars.ReadWrite', 'offline_access', 'User.Read']) {
      assert.ok(TEAMS_SCOPES.includes(scope));
    }
    assert.ok(url.includes('Calendars.ReadWrite'));
  });
});

describe('buildTeamsMeetingPayload', () => {
  test('creates an online meeting with correct end time and attendees', () => {
    const start = new Date('2026-10-05T14:30:00.000Z');
    const payload = buildTeamsMeetingPayload({
      topic: 'Revisión',
      startTime: start,
      duration: 60,
      timezone: 'Europe/Madrid',
      agenda: 'Agenda del día',
      attendees: ['ana@example.com'],
    }) as any;
    assert.equal(payload.subject, 'Revisión');
    assert.equal(payload.startDateTime, '2026-10-05T14:30:00.000Z');
    assert.equal(payload.endDateTime, '2026-10-05T15:30:00.000Z');
    assert.equal(payload.isOnlineMeeting, true);
    assert.equal(payload.onlineMeetingProvider, 'teamsForBusiness');
    assert.equal(payload.attendees.length, 1);
    assert.equal(payload.attendees[0].emailAddress.address, 'ana@example.com');
    assert.equal(payload.attendees[0].type, 'required');
  });
});