/**
 * Tests for lib/resources.ts (node:test + tsx, pure — no DB, no network).
 */
process.env.TZ = 'Europe/Madrid'; // localSlotParts assertions are Madrid-specific
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  timeToMinutes,
  hasOwnSchedule,
  localSlotParts,
  resourceVerdict,
  resourceCanTakeSlot,
  countOverlaps,
  pickFreeResource,
  effectiveVerdict,
  buildDayCandidates,
  chooseResourcePerSlot,
  type ResourceLike,
  type ResourceWithLocation,
  type OverlappingBooking,
} from '../lib/resources';

const rule = (over: Partial<{ dayOfWeek: number; startTime: string; endTime: string; isAvailable: boolean }> = {}) => ({
  dayOfWeek: 1, // Monday
  startTime: '09:00',
  endTime: '17:00',
  isAvailable: true,
  ...over,
});

describe('timeToMinutes', () => {
  test('parses "HH:MM" to minutes since midnight', () => {
    assert.equal(timeToMinutes('09:00'), 540);
    assert.equal(timeToMinutes('9:00'), 540); // 1-2 digits accepted
    assert.equal(timeToMinutes('00:00'), 0);
    assert.equal(timeToMinutes('23:59'), 1439);
  });

  test('returns -1 for malformed or out-of-range input', () => {
    assert.equal(timeToMinutes('24:00'), -1);
    assert.equal(timeToMinutes('09:60'), -1);
    assert.equal(timeToMinutes(''), -1);
    assert.equal(timeToMinutes('9am'), -1);
  });
});

describe('hasOwnSchedule', () => {
  test('false when resource has no availability rows', () => {
    assert.equal(hasOwnSchedule({ availabilities: [] }), false);
  });
  test('true when resource has any availability row', () => {
    assert.equal(hasOwnSchedule({ availabilities: [rule()] }), true);
  });
});

describe('localSlotParts', () => {
  test('returns weekday and wall-clock minutes in the given timezone', () => {
    // Monday 2026-01-05 10:30 Madrid (CET, UTC+1)
    const d = new Date('2026-01-05T09:30:00Z');
    const parts = localSlotParts(d, 'Europe/Madrid');
    assert.equal(parts.dayOfWeek, 1);
    assert.equal(parts.minutes, 10 * 60 + 30);
  });

  test('DST: same UTC instant maps to a different wall clock in Madrid in summer', () => {
    // 2026-07-06 09:30Z → Madrid is UTC+2 → 11:30 local, Monday
    const d = new Date('2026-07-06T09:30:00Z');
    const parts = localSlotParts(d, 'Europe/Madrid');
    assert.equal(parts.dayOfWeek, 1);
    assert.equal(parts.minutes, 11 * 60 + 30);
  });
});

describe('resourceVerdict', () => {
  test('inherit when the resource has no schedule rules', () => {
    assert.equal(resourceVerdict({ availabilities: [] }, 1, 540, 570), 'inherit');
  });

  test('open when the slot fits inside an open window of the right weekday', () => {
    const res = { availabilities: [rule()] }; // Mon 09:00-17:00
    assert.equal(resourceVerdict(res, 1, 540, 600), 'open'); // 09:00-10:00
    assert.equal(resourceVerdict(res, 1, 960, 1020), 'open'); // 16:00-17:00
  });

  test('closed on another weekday or outside the window', () => {
    const res = { availabilities: [rule()] };
    assert.equal(resourceVerdict(res, 2, 540, 600), 'closed'); // Tuesday
    assert.equal(resourceVerdict(res, 1, 480, 540), 'closed'); // 08:00-09:00
    assert.equal(resourceVerdict(res, 1, 1020, 1080), 'closed'); // 17:00-18:00
  });

  test('closed windows win over open ones (maintenance blocks part of a day)', () => {
    const res = {
      availabilities: [rule(), rule({ startTime: '12:00', endTime: '13:00', isAvailable: false })],
    };
    assert.equal(resourceVerdict(res, 1, 540, 600), 'open'); // 09:00 unaffected
    assert.equal(resourceVerdict(res, 1, 720, 750), 'closed'); // inside 12:00-13:00
    assert.equal(resourceVerdict(res, 1, 780, 840), 'open'); // 13:00-14:00 again
  });

  test('split shifts: multiple open windows per day', () => {
    const res = {
      availabilities: [rule({ startTime: '09:00', endTime: '14:00' }), rule({ startTime: '15:00', endTime: '17:00' })],
    };
    assert.equal(resourceVerdict(res, 1, 540, 600), 'open'); // morning
    assert.equal(resourceVerdict(res, 1, 840, 870), 'closed'); // 14:00-14:30 gap
    assert.equal(resourceVerdict(res, 1, 900, 960), 'open'); // afternoon
  });
});

describe('resourceCanTakeSlot / countOverlaps', () => {
  const resource: ResourceLike = {
    id: 'r1',
    capacity: 1,
    isActive: true,
    availabilities: [rule()],
  };
  const overlap = (start: string, end: string): OverlappingBooking => ({
    startTime: new Date(start),
    endTime: new Date(end),
  });

  test('active booking on the same resource blocks an overlapping slot', () => {
    const slotStart = new Date('2026-01-05T09:00:00Z'); // Mon 10:00 Madrid
    const slotEnd = new Date('2026-01-05T10:00:00Z');
    const conflicts = [overlap('2026-01-05T09:30:00Z', '2026-01-05T11:00:00Z')];
    assert.equal(
      resourceCanTakeSlot(resource, slotStart, slotEnd, 'Europe/Madrid', conflicts),
      false
    );
  });

  test('inactive resource is never bookable', () => {
    const res = { ...resource, isActive: false };
    assert.equal(
      resourceCanTakeSlot(res, new Date('2026-01-05T09:00:00Z'), new Date('2026-01-05T10:00:00Z'), 'Europe/Madrid', []),
      false
    );
  });

  test('capacity 1: adjacent (non-overlapping) bookings are fine', () => {
    // slot 10:00-11:00 Madrid, conflict ends exactly at slot start
    const conflicts = [overlap('2026-01-05T07:00:00Z', '2026-01-05T09:00:00Z')];
    assert.equal(
      resourceCanTakeSlot(resource, new Date('2026-01-05T09:00:00Z'), new Date('2026-01-05T10:00:00Z'), 'Europe/Madrid', conflicts),
      true
    );
  });

  test('capacity 2 allows one simultaneous booking but blocks two', () => {
    const room: ResourceLike = { ...resource, capacity: 2 };
    const slotStart = new Date('2026-01-05T09:00:00Z');
    const slotEnd = new Date('2026-01-05T10:00:00Z');
    assert.equal(resourceCanTakeSlot(room, slotStart, slotEnd, 'Europe/Madrid', [overlap('2026-01-05T08:00:00Z', '2026-01-05T11:00:00Z')]), true);
    assert.equal(resourceCanTakeSlot(room, slotStart, slotEnd, 'Europe/Madrid', [
      overlap('2026-01-05T08:00:00Z', '2026-01-05T11:00:00Z'),
      overlap('2026-01-05T08:30:00Z', '2026-01-05T12:00:00Z'),
    ]), false);
  });

  test('countOverlaps counts intervals with open-interval semantics', () => {
    const base = new Date('2026-01-05T09:00:00Z');
    const end = new Date('2026-01-05T10:00:00Z');
    assert.equal(countOverlaps([overlap('2026-01-05T08:00:00Z', '2026-01-05T09:00:00Z')], base, end), 0); // touches start exactly
    assert.equal(countOverlaps([overlap('2026-01-05T08:00:00Z', '2026-01-05T09:30:00Z')], base, end), 1);
    assert.equal(countOverlaps([overlap('2026-01-05T10:00:00Z', '2026-01-05T11:00:00Z')], base, end), 0); // touches end exactly
  });
});

describe('pickFreeResource', () => {
  const mk = (id: string, capacity = 1): ResourceLike => ({
    id,
    capacity,
    isActive: true,
    availabilities: [], // inherit — capacity is the only constraint here
  });
  const slotStart = new Date('2026-01-05T09:00:00Z');
  const slotEnd = new Date('2026-01-05T10:00:00Z');
  const noOverlaps = () => [];

  test('returns null when no candidate is free', () => {
    const busy = (r: ResourceLike): OverlappingBooking[] => r.id === 'a' || r.id === 'b'
      ? [{ startTime: new Date('2026-01-05T08:00:00Z'), endTime: new Date('2026-01-05T11:00:00Z') }]
      : [];
    const picked = pickFreeResource([mk('a'), mk('b')], busy, slotStart, slotEnd, 'Europe/Madrid');
    assert.equal(picked, null);
  });

  test('picks the preferred resource when it is free', () => {
    const picked = pickFreeResource([mk('a'), mk('b')], noOverlaps, slotStart, slotEnd, 'Europe/Madrid', 'b');
    assert.equal(picked?.id, 'b');
  });

  test('skips a busy preferred resource and picks a free one', () => {
    const busy = (r: ResourceLike): OverlappingBooking[] => r.id === 'b'
      ? [{ startTime: new Date('2026-01-05T08:00:00Z'), endTime: new Date('2026-01-05T11:00:00Z') }]
      : [];
    const picked = pickFreeResource([mk('a'), mk('b')], busy, slotStart, slotEnd, 'Europe/Madrid', 'b');
    assert.equal(picked?.id, 'a');
  });

  test('balances wear: picks the least loaded resource', () => {
    // 'a' has one overlap, 'b' has zero → b
    const busy = (r: ResourceLike): OverlappingBooking[] => r.id === 'a'
      ? [{ startTime: new Date('2026-01-05T08:00:00Z'), endTime: new Date('2026-01-05T11:00:00Z') }]
      : [];
    const picked = pickFreeResource([mk('a'), mk('b')], busy, slotStart, slotEnd, 'Europe/Madrid');
    assert.equal(picked?.id, 'b');
  });
});

describe('effectiveVerdict', () => {
  const pageWindows = [{ startTime: '09:00', endTime: '17:00' }];

  test('resource without own rules inherits the page windows', () => {
    const res = { availabilities: [] };
    assert.equal(effectiveVerdict(res, pageWindows, 1, 540, 600), 'open');
    assert.equal(effectiveVerdict(res, pageWindows, 1, 480, 540), 'closed'); // 08:00-09:00
    assert.equal(effectiveVerdict(res, pageWindows, 2, 540, 600), 'open'); // any weekday
  });

  test('resource with own rules substitutes the page windows', () => {
    const res = { availabilities: [rule()] }; // Mon 09:00-17:00
    assert.equal(effectiveVerdict(res, pageWindows, 1, 540, 600), 'open');
    assert.equal(effectiveVerdict(res, pageWindows, 2, 540, 600), 'closed'); // Tuesday closed
    assert.equal(effectiveVerdict(res, pageWindows, 1, 480, 540), 'closed'); // page 08:00 open, resource closed
  });
});

describe('buildDayCandidates', () => {
  test('page windows when every resource inherits', () => {
    const resources = [{ id: 'r1', name: 'R1', capacity: 1, availabilities: [], isActive: true } as ResourceWithLocation];
    const out = buildDayCandidates([{ startTime: '09:00', endTime: '10:00' }], resources, 1, 15);
    assert.deepEqual(out, ['09:00', '09:15', '09:30', '09:45']);
  });

  test('union with resource-only open windows (machine open Saturdays)', () => {
    const resources = [{
      id: 'm1', name: 'Máquina', capacity: 1, isActive: true,
      availabilities: [rule({ dayOfWeek: 6, startTime: '10:00', endTime: '12:00' })],
    } as ResourceWithLocation];
    // Page closed that day → candidates come only from the machine's own windows
    const out = buildDayCandidates([], resources, 6, 30);
    assert.deepEqual(out, ['10:00', '10:30', '11:00', '11:30']);
  });

  test('inactive resources do not add windows', () => {
    const resources = [{
      id: 'm1', name: 'Máquina', capacity: 1, isActive: false,
      availabilities: [rule({ dayOfWeek: 6, startTime: '10:00', endTime: '12:00' })],
    } as ResourceWithLocation];
    assert.deepEqual(buildDayCandidates([], resources, 6, 30), []);
  });
});

describe('chooseResourcePerSlot', () => {
  // Monday 2026-01-05; page open 09:00-17:00
  const mkSlot = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return new Date(2026, 0, 5, h, m, 0, 0);
  };
  const chair = (id: string, extra: Partial<ResourceWithLocation> = {}): ResourceWithLocation => ({
    id, name: id, capacity: 1, isActive: true, availabilities: [], ...extra,
  });
  const overlap = (startH: number, endH: number): OverlappingBooking => ({
    startTime: new Date(2026, 0, 5, startH, 0, 0, 0),
    endTime: new Date(2026, 0, 5, endH, 0, 0, 0),
  });
  const base = {
    candidates: ['09:00', '10:00', '11:00'],
    dayOfWeek: 1,
    pageOpenWindows: [{ startTime: '09:00', endTime: '17:00' }],
    resources: [chair('a'), chair('b')],
    durationMinutes: 60,
    slotDateFor: mkSlot,
    bookingsByResource: new Map(),
  };

  test('all slots available when resources are free; first declared wins', () => {
    const out = chooseResourcePerSlot(base);
    assert.deepEqual(out.map((o) => o.time), ['09:00', '10:00', '11:00']);
    assert.ok(out.every((o) => o.resourceId === 'a'));
  });

  test('preferred resource is chosen when free', () => {
    const out = chooseResourcePerSlot({ ...base, preferredId: 'b' });
    assert.ok(out.every((o) => o.resourceId === 'b'));
  });

  test('slot disappears when every resource is busy on it', () => {
    const bookingsByResource = new Map<string, OverlappingBooking[]>([
      ['a', [overlap(8, 12)]],
      ['b', [overlap(9, 13)]],
    ]);
    const out = chooseResourcePerSlot({ ...base, bookingsByResource });
    assert.deepEqual(out, []);
  });

  test('least loaded resource is chosen when preferred is busy', () => {
    const bookingsByResource = new Map<string, OverlappingBooking[]>([
      ['a', [overlap(8, 16)]], // busy all day
    ]);
    const out = chooseResourcePerSlot({ ...base, bookingsByResource, preferredId: 'a' });
    assert.ok(out.length > 0);
    assert.ok(out.every((o) => o.resourceId === 'b'));
  });

  test('legacy bookings (no resource) block every resource', () => {
    const out = chooseResourcePerSlot({ ...base, legacyOverlaps: [overlap(8, 16)] });
    assert.deepEqual(out, []);
  });

  test('capacity 2 keeps the slot while one of two bookings overlaps', () => {
    const resources = [chair('a', { capacity: 2 })];
    const bookingsByResource = new Map<string, OverlappingBooking[]>([['a', [overlap(8, 12)]]]);
    const out = chooseResourcePerSlot({ ...base, resources, bookingsByResource });
    assert.deepEqual(out.map((o) => o.time), ['09:00', '10:00', '11:00']);
  });
});
