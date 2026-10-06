/**
 * Tests for lib/availability-engine.ts (node:test + tsx, pure — no DB/network).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  wallClockToInstant,
  formatTimeInTz,
  weekdayOfYmd,
  daySpanInTz,
  generateCandidateInstants,
  computeDayOffers,
  isInsideDayWindows,
  partialBlockWindow,
  type DayWindow,
  type EngineResource,
} from '../lib/availability-engine';
import type { AvailabilityRule } from '../lib/resources';

// 2026-09-07 is a Monday (verified against real IANA data in the suite).
const MON = '2026-09-07';

const window = (dayOfWeek: number, startTime: string, endTime: string): DayWindow => ({
  dayOfWeek,
  startTime,
  endTime,
});

const rule = (dayOfWeek: number, startTime: string, endTime: string, isAvailable = true): AvailabilityRule => ({
  dayOfWeek,
  startTime,
  endTime,
  isAvailable,
});

const res = (over: Partial<EngineResource>): EngineResource => ({
  id: 'r1',
  name: 'Sillón 1',
  capacity: 1,
  isActive: true,
  timezone: null,
  rules: [],
  blockedToday: false,
  ...over,
});

const emptyOverlaps = new Map<string, { startTime: Date; endTime: Date }[]>();

const offers = (over: Record<string, unknown>) =>
  computeDayOffers({
    guestDate: MON,
    guestTz: 'UTC',
    anchorTz: 'UTC',
    displayTz: 'UTC',
    pageOpenWindows: [],
    resources: [],
    slotInterval: 60,
    durationMinutes: 60,
    overlapsByResource: emptyOverlaps,
    ...over,
  } as never).map((o) => o.time);

describe('wallClockToInstant', () => {
  test('converts wall time to the right instant (Madrid UTC+2 in summer)', () => {
    const d = wallClockToInstant(MON, '09:00', 'Europe/Madrid');
    assert.equal(d.toISOString(), '2026-09-07T07:00:00.000Z');
  });

  test('converts wall time to the right instant (winter CET)', () => {
    const d = wallClockToInstant('2026-01-05', '09:00', 'Europe/Madrid'); // Monday
    assert.equal(d.toISOString(), '2026-01-05T08:00:00.000Z');
  });

  test('formatTimeInTz round-trips across timezones', () => {
    const d = wallClockToInstant(MON, '09:00', 'Europe/Madrid');
    assert.equal(formatTimeInTz(d, 'Europe/London'), '08:00'); // BST = UTC+1
    assert.equal(formatTimeInTz(d, 'America/Mexico_City'), '01:00'); // CST = UTC-6
  });
});

describe('weekdayOfYmd', () => {
  test('2026-09-07 is Monday', () => {
    assert.equal(weekdayOfYmd(MON, 'UTC'), 1);
    assert.equal(weekdayOfYmd(MON, 'Europe/Madrid'), 1);
  });
});

describe('daySpanInTz', () => {
  test('guest day is a real 24h instant range in the guest tz', () => {
    const { start, end } = daySpanInTz(MON, 'America/Mexico_City');
    assert.equal(start.toISOString(), '2026-09-07T06:00:00.000Z');
    assert.equal(end.toISOString(), '2026-09-08T06:00:00.000Z');
  });
});

describe('generateCandidateInstants', () => {
  test('a full anchor day crosses into the previous day when the tz is east', () => {
    const range = daySpanInTz(MON, 'Europe/Madrid'); // Sep 6 22:00Z → Sep 7 22:00Z
    const instants = generateCandidateInstants(
      [{ timezone: 'Europe/Madrid', windows: [window(1, '09:00', '10:00')] }],
      range.start,
      range.end,
      60
    );
    assert.equal(instants.length, 1);
    // Monday 09:00 Madrid of Sep 7
    assert.equal(instants[0].toISOString(), '2026-09-07T07:00:00.000Z');
  });

  test('includes slots from both anchor days when the guest day spans two sede days', () => {
    // Mexico City SUNDAY (Sep 6) = Sep 6 06:00Z → Sep 7 06:00Z. That instant
    // range touches two Madrid days: Sunday 09:00 Madrid (07:00Z Sep 6) and
    // Monday 00:00 Madrid (22:00Z Sep 6, before the Madrid day rolls over).
    const range = daySpanInTz('2026-09-06', 'America/Mexico_City');
    const instants = generateCandidateInstants(
      [
        {
          timezone: 'Europe/Madrid',
          windows: [window(0, '09:00', '10:00'), window(1, '00:00', '01:00')],
        },
      ],
      range.start,
      range.end,
      60
    );
    assert.deepEqual(
      instants.map((d) => d.toISOString()),
      ['2026-09-06T07:00:00.000Z', '2026-09-06T22:00:00.000Z']
    );
  });
});

describe('isInsideDayWindows', () => {
  test('slot must fit inside a window of the same weekday', () => {
    const windows = [window(1, '09:00', '17:00')];
    assert.equal(isInsideDayWindows(windows, 1, 9 * 60, 10 * 60), true);
    assert.equal(isInsideDayWindows(windows, 2, 9 * 60, 10 * 60), false);
    assert.equal(isInsideDayWindows(windows, 1, 8 * 60, 9 * 60), false);
    assert.equal(isInsideDayWindows(windows, 1, 16 * 60, 17 * 60), true);
    assert.equal(isInsideDayWindows(windows, 1, 16 * 60, 18 * 60), false);
  });
});

describe('computeDayOffers — classic mode (no resources)', () => {
  const page = [window(1, '09:00', '17:00')];

  test('same market: identical to legacy naive behaviour', () => {
    const result = computeDayOffers({
      guestDate: MON,
      guestTz: 'UTC',
      anchorTz: 'UTC',
      displayTz: 'UTC',
      pageOpenWindows: page,
      resources: [],
      slotInterval: 60,
      durationMinutes: 60,
      overlapsByResource: emptyOverlaps,
    });
    assert.deepEqual(
      result.map((o) => o.time),
      ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00']
    );
    // Instants are the true UTC instants of the windows.
    assert.equal(result[0].instant.toISOString(), '2026-09-07T09:00:00.000Z');
  });

  test('Madrid page, Madrid guest: strings unchanged, instants shifted to Madrid', () => {
    const result = computeDayOffers({
      guestDate: MON,
      guestTz: 'Europe/Madrid',
      anchorTz: 'Europe/Madrid',
      displayTz: 'Europe/Madrid',
      pageOpenWindows: page,
      resources: [],
      slotInterval: 60,
      durationMinutes: 60,
      overlapsByResource: emptyOverlaps,
    });
    assert.equal(result[0].time, '09:00');
    assert.equal(result[0].instant.toISOString(), '2026-09-07T07:00:00.000Z');
  });

  test('a 90-minute event inside a 2h window', () => {
    const result = computeDayOffers({
      guestDate: MON,
      guestTz: 'UTC',
      anchorTz: 'UTC',
      displayTz: 'UTC',
      pageOpenWindows: [window(1, '09:00', '11:00')],
      resources: [],
      slotInterval: 60,
      durationMinutes: 90,
      overlapsByResource: emptyOverlaps,
    });
    assert.deepEqual(result.map((o) => o.time), ['09:00']);
  });
});

describe('computeDayOffers — resource mode', () => {
  const page = [window(1, '08:00', '20:00')];

  test('per-resource time off removes only that resource; others still serve', () => {
    const r1 = res({ id: 'r1', name: 'Sillón 1', rules: [] });
    const r2 = res({ id: 'r2', name: 'Sillón 2', rules: [], blockedToday: true });
    const result = computeDayOffers({
      guestDate: MON,
      guestTz: 'UTC',
      anchorTz: 'UTC',
      displayTz: 'UTC',
      pageOpenWindows: page,
      resources: [r1, r2],
      slotInterval: 60,
      durationMinutes: 60,
      overlapsByResource: emptyOverlaps,
    });
    assert.ok(result.length > 0);
    assert.ok(result.every((o) => o.resourceId === 'r1'));
  });

  test('all resources blocked → no offers even with an open page', () => {
    const result = computeDayOffers({
      guestDate: MON,
      guestTz: 'UTC',
      anchorTz: 'UTC',
      displayTz: 'UTC',
      pageOpenWindows: page,
      resources: [res({ id: 'r1', blockedToday: true }), res({ id: 'r2', blockedToday: true })],
      slotInterval: 60,
      durationMinutes: 60,
      overlapsByResource: emptyOverlaps,
    });
    assert.equal(result.length, 0);
  });

  test('capacity: two active bookings on the same exclusive resource block it', () => {
    const overlap = { startTime: new Date('2026-09-07T09:30:00Z'), endTime: new Date('2026-09-07T10:30:00Z') };
    const byResource = new Map([['r1', [overlap]]]);
    const result = computeDayOffers({
      guestDate: MON,
      guestTz: 'UTC',
      anchorTz: 'UTC',
      displayTz: 'UTC',
      pageOpenWindows: page,
      resources: [res({ id: 'r1' })],
      slotInterval: 60,
      durationMinutes: 60,
      overlapsByResource: byResource,
    });
    assert.ok(!result.map((o) => o.time).includes('10:00'));
    assert.ok(result.map((o) => o.time).includes('11:00'));
  });

  test('resource with own windows in a different sede timezone', () => {
    // Resource lives in Mexico City (UTC-6), open Mon 10:00-12:00 local.
    const r = res({
      id: 'mex',
      name: 'Sillón CDMX',
      timezone: 'America/Mexico_City',
      rules: [rule(1, '10:00', '12:00')],
    });
    // Madrid guest day (Sep 7 00:00-24:00 Madrid = Sep 6 22:00Z → Sep 7 22:00Z).
    const result = computeDayOffers({
      guestDate: MON,
      guestTz: 'Europe/Madrid',
      anchorTz: 'Europe/Madrid',
      displayTz: 'Europe/Madrid',
      pageOpenWindows: page,
      resources: [r],
      slotInterval: 60,
      durationMinutes: 60,
      overlapsByResource: emptyOverlaps,
    });
    // CDMX 10:00 and 11:00 = 16:00Z/17:00Z = 18:00/19:00 Madrid
    assert.deepEqual(
      result.map((o) => o.time),
      ['18:00', '19:00']
    );
    assert.equal(result[0].resourceId, 'mex');
    assert.equal(result[0].instant.toISOString(), '2026-09-07T16:00:00.000Z');
  });

  test('least-loaded resource wins when both are free', () => {
    const byResource = new Map<string, { startTime: Date; endTime: Date }[]>([
      ['r1', []],
      ['r2', []],
    ]);
    const result = computeDayOffers({
      guestDate: MON,
      guestTz: 'UTC',
      anchorTz: 'UTC',
      displayTz: 'UTC',
      pageOpenWindows: page,
      resources: [res({ id: 'r1', name: 'A' }), res({ id: 'r2', name: 'B' })],
      slotInterval: 60,
      durationMinutes: 60,
      overlapsByResource: byResource,
    });
    assert.ok(result.every((o) => o.resourceId === 'r1'));
  });
});

describe('partialBlockWindow — a "few hours" absence is a daily window', () => {
  // The real-world case: a course stored 24 sep 16:00 → 23 oct 20:00 (Madrid).
  const course = {
    start: new Date('2026-09-24T14:00:00.000Z'), // 16:00 Madrid
    end: new Date('2026-10-23T18:00:00.000Z'), // 20:00 Madrid
  };

  test('every day of the range closes the same hours, not the whole day', () => {
    const win = partialBlockWindow(course, '2026-10-07', 'Europe/Madrid');
    assert.ok(win);
    assert.equal(win!.start.toISOString(), '2026-10-07T14:00:00.000Z');
    assert.equal(win!.end.toISOString(), '2026-10-07T18:00:00.000Z');
  });

  test('the boundary days match the instants the owner picked', () => {
    assert.equal(
      partialBlockWindow(course, '2026-09-24', 'Europe/Madrid')!.start.toISOString(),
      course.start.toISOString()
    );
    assert.equal(
      partialBlockWindow(course, '2026-10-23', 'Europe/Madrid')!.end.toISOString(),
      course.end.toISOString()
    );
  });

  test('days outside the range are untouched', () => {
    assert.equal(partialBlockWindow(course, '2026-09-23', 'Europe/Madrid'), null);
    assert.equal(partialBlockWindow(course, '2026-10-24', 'Europe/Madrid'), null);
  });

  test('a single-day lunch break keeps its exact instants', () => {
    const lunch = {
      start: new Date('2026-09-07T12:00:00.000Z'),
      end: new Date('2026-09-07T14:00:00.000Z'),
    };
    const win = partialBlockWindow(lunch, '2026-09-07', 'Europe/Madrid');
    assert.equal(win!.start.toISOString(), '2026-09-07T12:00:00.000Z');
    assert.equal(win!.end.toISOString(), '2026-09-07T14:00:00.000Z');
    assert.equal(partialBlockWindow(lunch, '2026-09-08', 'Europe/Madrid'), null);
  });

  test('an overnight block is not a daily window (callers fall back to the instants)', () => {
    const night = {
      start: new Date('2026-09-24T20:00:00.000Z'), // 22:00 Madrid
      end: new Date('2026-09-25T02:00:00.000Z'), // 04:00 Madrid, next day
    };
    assert.equal(partialBlockWindow(night, '2026-09-24', 'Europe/Madrid'), null);
  });
});

describe('a month-long "few hours" block leaves the rest of the day bookable', () => {
  test('morning slots survive while the course hours stay closed', () => {
    const course = {
      start: new Date('2026-09-24T14:00:00.000Z'), // 16:00 Madrid
      end: new Date('2026-10-23T18:00:00.000Z'), // 20:00 Madrid
    };
    const day = '2026-10-07'; // Wednesday
    const dayOffers = computeDayOffers({
      guestDate: day,
      guestTz: 'Europe/Madrid',
      anchorTz: 'Europe/Madrid',
      displayTz: 'Europe/Madrid',
      pageOpenWindows: [window(3, '09:00', '14:00'), window(3, '15:00', '16:30')],
      resources: [],
      slotInterval: 15,
      durationMinutes: 45,
      overlapsByResource: emptyOverlaps,
    });
    const win = partialBlockWindow(course, day, 'Europe/Madrid')!;
    const free = dayOffers.filter(
      (o) =>
        !(
          o.instant < win.end &&
          new Date(o.instant.getTime() + 45 * 60_000) > win.start
        )
    );
    // Before the fix the raw month-long range filtered every single slot out.
    assert.ok(free.length > 0);
    assert.equal(free[0].time, '09:00');
    assert.ok(free.some((o) => o.time === '13:15'));
    assert.ok(free.every((o) => o.time < '16:00'));
  });
});
