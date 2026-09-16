/**
 * Tests for lib/gcal-repair.ts (node:test + tsx).
 *
 * Prisma is an in-memory fake; calendar ops are stubbed. Covers the three
 * drift classes, series first-occurrence policy, cancel cleanup, content
 * relink and the owner sweep.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  repairOwnerCalendar,
  listSyncedOwners,
  readLastRun,
  writeLastRun,
  REPAIR_HORIZON_DAYS,
  REPAIR_PAST_DAYS,
} from './gcal-repair';

// ---------------------------------------------------------------------------
// In-memory prisma fake
// ---------------------------------------------------------------------------
type Row = Record<string, any>;

function makeDb(seed: { users: Row[]; bookings: Row[]; settings: Row[] }) {
  const db = {
    users: seed.users,
    bookings: seed.bookings,
    settings: seed.settings,
    user: {
      findUnique: async ({ where }: any) => db.users.find((u) => u.id === where.id) ?? null,
      findMany: async ({ where, select }: any) =>
        db.users
          .filter((u) => u.calendarSyncEnabled && u.accounts?.some((a: Row) => a.provider === 'google'))
          .map((u) => (select ? { id: u.id } : u)),
    },
    booking: {
      findMany: async ({ where }: any) => {
        // Match the production query shape: time window + owner filter. The
        // owner join (eventType.bookingPage.userId) is Prisma's job — the fake
        // applies only the time window (each test seeds one owner's bookings).
        return db.bookings.filter((b) => {
          const t = b.startTime.getTime();
          const inWindow =
            !where.startTime ||
            (t >= where.startTime.gte.getTime() && t <= where.startTime.lte.getTime());
          return inWindow;
        });
      },
      update: async ({ where, data }: any) => {
        const b = db.bookings.find((x) => x.id === where.id);
        if (b) Object.assign(b, data);
        return b;
      },
    },
    systemSetting: {
      findUnique: async ({ where }: any) => db.settings.find((s) => s.key === where.key) ?? null,
      upsert: async ({ where, create }: any) => {
        const i = db.settings.findIndex((s) => s.key === where.key);
        if (i >= 0) db.settings[i] = create;
        else db.settings.push(create);
        return create;
      },
    },
  };
  return db;
}

// ---------------------------------------------------------------------------
// Calendar stub
// ---------------------------------------------------------------------------
function makeCalendar(eventsById: Map<string, any>, log: string[] = []) {
  let nextId = 1;
  return {
    eventsById,
    log,
    list: async () => Array.from(eventsById.values()).filter((e) => e.status !== 'cancelled'),
    create: async (_userId: string, data: any) => {
      const id = `gnew_${nextId++}`;
      log.push(`create:${data.summary}`);
      const ev = {
        id,
        status: 'confirmed',
        summary: data.summary,
        description: data.description,
        start: { dateTime: data.start.toISOString() },
        end: { dateTime: data.end.toISOString() },
      };
      eventsById.set(id, ev);
      return ev;
    },
    del: async (_userId: string, eventId: string) => {
      log.push(`delete:${eventId}`);
      const ev = eventsById.get(eventId);
      if (ev) ev.status = 'cancelled';
    },
    update: async (_userId: string, eventId: string, data: any) => {
      log.push(`update:${eventId}`);
      const ev = eventsById.get(eventId);
      if (ev) {
        if (data.start) ev.start = { dateTime: data.start.toISOString() };
        if (data.end) ev.end = { dateTime: data.end.toISOString() };
        if (data.description) ev.description = data.description;
      }
      return ev;
    },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const NOW = new Date('2026-09-16T12:00:00.000Z');
const DAY = 86_400_000;

function eventType(name = 'Consulta', videoProvider = 'ZOOM', videoLink: string | null = null) {
  return { name, videoProvider, videoLink };
}

function booking(over: Partial<Row> = {}): Row {
  return {
    id: 'b1',
    guestName: 'Ana',
    guestEmail: 'ana@example.com',
    guestPhone: null,
    startTime: new Date(NOW.getTime() + 2 * DAY),
    endTime: new Date(NOW.getTime() + 2 * DAY + 30 * 60_000),
    status: 'CONFIRMED',
    meetingUrl: 'https://zoom.us/j/123',
    resourceName: null,
    locationName: null,
    locationAddress: null,
    googleCalendarEventId: null,
    seriesId: null,
    series: null,
    eventType: eventType(),
    ...over,
  };
}

function gEvent(over: Partial<Row> = {}): Row {
  const b = over.__booking;
  delete over.__booking;
  return {
    id: 'g1',
    status: 'confirmed',
    summary: 'Consulta - Ana',
    description: 'Reserva con Ana\nEmail: ana@example.com',
    start: { dateTime: (b?.startTime ?? NOW).toISOString() },
    end: { dateTime: (b?.endTime ?? NOW).toISOString() },
    ...over,
  };
}

function runDeps(db: ReturnType<typeof makeDb>, cal: ReturnType<typeof makeCalendar>) {
  return { prisma: db as any, calendar: cal as any, now: NOW };
}

describe('gcal-repair', () => {
  test('Class 1: active booking without event → creates it and links', async () => {
    const b = booking();
    const db = makeDb({
      users: [{ id: 'u1', calendarSyncEnabled: true, accounts: [{ provider: 'google' }] }],
      bookings: [b],
      settings: [],
    });
    const cal = makeCalendar(new Map());
    const r = await repairOwnerCalendar('u1', runDeps(db, cal));
    assert.equal(r.created, 1);
    assert.equal(b.googleCalendarEventId, 'gnew_1');
    assert.ok(cal.log[0].includes('Consulta - Ana'));
    // Description includes the Zoom link.
    const created = cal.eventsById.get('gnew_1')!;
    assert.ok(created.description.includes('🔗 Zoom: https://zoom.us/j/123'));
  });

  test('Class 2: stale eventId (event deleted in Google) → recreates and relinks', async () => {
    const b = booking({ googleCalendarEventId: 'gdead' });
    const db = makeDb({
      users: [{ id: 'u1', calendarSyncEnabled: true, accounts: [{ provider: 'google' }] }],
      bookings: [b],
      settings: [],
    });
    const cal = makeCalendar(new Map()); // gdead does not exist
    const r = await repairOwnerCalendar('u1', runDeps(db, cal));
    assert.equal(r.created, 1);
    assert.equal(b.googleCalendarEventId, 'gnew_1');
  });

  test('Class 3: event at wrong time → moves it (update, no duplicate)', async () => {
    const b = booking();
    const wrong = gEvent({
      id: 'g1',
      __booking: null,
      start: { dateTime: new Date(b.startTime.getTime() + 3 * 3_600_000).toISOString() },
      end: { dateTime: new Date(b.endTime.getTime() + 3 * 3_600_000).toISOString() },
    });
    b.googleCalendarEventId = 'g1';
    const db = makeDb({
      users: [{ id: 'u1', calendarSyncEnabled: true, accounts: [{ provider: 'google' }] }],
      bookings: [b],
      settings: [],
    });
    const cal = makeCalendar(new Map([['g1', wrong]]));
    const r = await repairOwnerCalendar('u1', runDeps(db, cal));
    assert.equal(r.created, 0);
    assert.equal(r.updated, 1);
    const ev = cal.eventsById.get('g1')!;
    assert.equal(ev.start.dateTime, b.startTime.toISOString());
    assert.equal(ev.end.dateTime, b.endTime.toISOString());
  });

  test('Cancelled booking with still-live event → deletes it', async () => {
    const b = booking({ status: 'CANCELLED', googleCalendarEventId: 'g1' });
    const db = makeDb({
      users: [{ id: 'u1', calendarSyncEnabled: true, accounts: [{ provider: 'google' }] }],
      bookings: [b],
      settings: [],
    });
    const cal = makeCalendar(new Map([['g1', gEvent({ id: 'g1', __booking: b })]]));
    const r = await repairOwnerCalendar('u1', runDeps(db, cal));
    assert.equal(r.deleted, 1);
    assert.equal(cal.eventsById.get('g1')!.status, 'cancelled');
  });

  test('Recurring series: only the first occurrence is repaired', async () => {
    const b1 = booking({ id: 'b1', seriesId: 's1', startTime: new Date(NOW.getTime() + 2 * DAY), series: { recurrence: { freq: 'WEEKLY' } } });
    const b2 = booking({ id: 'b2', seriesId: 's1', startTime: new Date(NOW.getTime() + 9 * DAY), series: { recurrence: { freq: 'WEEKLY' } } });
    const db = makeDb({
      users: [{ id: 'u1', calendarSyncEnabled: true, accounts: [{ provider: 'google' }] }],
      bookings: [b1, b2],
      settings: [],
    });
    const cal = makeCalendar(new Map());
    const r = await repairOwnerCalendar('u1', runDeps(db, cal));
    assert.equal(r.created, 1); // only the first occurrence
  });

  test('Content relink: event exists at the slot owned by the same guest → adopt', async () => {
    const b = booking({ googleCalendarEventId: 'glost' });
    const orphan = gEvent({
      id: 'gorphan',
      __booking: b,
      description: 'Reserva con Ana\nEmail: ana@example.com\n\n🔗 Zoom: x',
    });
    const db = makeDb({
      users: [{ id: 'u1', calendarSyncEnabled: true, accounts: [{ provider: 'google' }] }],
      bookings: [b],
      settings: [],
    });
    const cal = makeCalendar(new Map([['gorphan', orphan]]));
    const r = await repairOwnerCalendar('u1', runDeps(db, cal));
    assert.equal(r.created, 0);
    assert.equal(r.relinked, 1);
    assert.equal(b.googleCalendarEventId, 'gorphan');
  });

  test('Owner without Google account or sync disabled → no-op', async () => {
    const b = booking();
    const db = makeDb({
      users: [{ id: 'u1', calendarSyncEnabled: false, accounts: [] }],
      bookings: [b],
      settings: [],
    });
    const cal = makeCalendar(new Map());
    const r = await repairOwnerCalendar('u1', runDeps(db, cal));
    assert.equal(r.checked, 0);
    assert.equal(r.created, 0);
  });

  test('listSyncedOwners returns only synced users', async () => {
    const db = makeDb({
      users: [
        { id: 'u1', calendarSyncEnabled: true, accounts: [{ provider: 'google' }] },
        { id: 'u2', calendarSyncEnabled: true, accounts: [] },
        { id: 'u3', calendarSyncEnabled: false, accounts: [{ provider: 'google' }] },
      ],
      bookings: [],
      settings: [],
    });
    const owners = await listSyncedOwners(db as any);
    assert.deepEqual(owners, ['u1']);
  });

  test('last-run marker round-trips through systemSetting', async () => {
    const db = makeDb({ users: [], bookings: [], settings: [] });
    assert.equal(await readLastRun(db as any), null);
    const run = { ranAt: NOW.toISOString(), ownersChecked: 3, created: 1, updated: 2, deleted: 0, relinked: 0, errors: 0, ok: true, durationSec: 12 };
    await writeLastRun(db as any, run);
    const back = await readLastRun(db as any);
    assert.equal(back?.created, 1);
    assert.equal(back?.ownersChecked, 3);
  });

  test('window constants', () => {
    assert.equal(REPAIR_HORIZON_DAYS, 60);
    assert.equal(REPAIR_PAST_DAYS, 30);
  });
});
