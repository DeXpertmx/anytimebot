/**
 * Tests for lib/time-off.ts (node:test + tsx, no network, no DB).
 *
 * These cover the two shapes of a block — whole days (what the original absence
 * feature stored) and partial-hour ranges (the lunch-break case) — plus the
 * normalization the API applies to both.
 */
process.env.TZ = 'Europe/Madrid'; // Local-hour assertions are Madrid-specific
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isWholeDayBlock,
  formatBlockWindow,
  rangesOverlap,
  resolveBlockRange,
} from '../lib/time-off';

describe('isWholeDayBlock', () => {
  test('the stored flag wins over the UTC hours', () => {
    // A Madrid whole day lands at 22:00Z/21:59Z — the flag keeps it a day.
    assert.equal(
      isWholeDayBlock({
        allDay: true,
        start: '2026-09-19T22:00:00.000Z',
        end: '2026-09-20T21:59:59.999Z',
      }),
      true
    );
  });

  test('the flag also marks partial blocks explicitly', () => {
    assert.equal(
      isWholeDayBlock({
        allDay: false,
        start: '2026-09-20T00:00:00.000Z',
        end: '2026-09-20T23:59:59.999Z',
      }),
      false
    );
  });

  test('legacy rows without the flag fall back to the UTC day bounds', () => {
    assert.equal(
      isWholeDayBlock({ start: '2026-09-20T00:00:00.000Z', end: '2026-09-27T23:59:59.999Z' }),
      true
    );
    assert.equal(
      isWholeDayBlock({ start: '2026-09-20T12:00:00.000Z', end: '2026-09-20T14:00:00.000Z' }),
      false
    );
  });

  test('invalid dates never crash', () => {
    assert.equal(isWholeDayBlock({ start: 'nonsense', end: 'nonsense' }), false);
  });
});

describe('formatBlockWindow', () => {
  test('whole days render as the local date range', () => {
    // Madrid day bounds: 20 sept 00:00 local → 22 sept 23:59:59 local.
    const label = formatBlockWindow({
      allDay: true,
      start: '2026-09-19T22:00:00.000Z',
      end: '2026-09-22T21:59:59.999Z',
    });
    assert.match(label, /20/);
    assert.match(label, /22/);
    assert.match(label, /–/);
  });

  test('a single whole day is not printed twice', () => {
    const label = formatBlockWindow({
      allDay: true,
      start: '2026-09-19T22:00:00.000Z',
      end: '2026-09-20T21:59:59.999Z',
    });
    assert.doesNotMatch(label, /–/);
  });

  test('partial ranges render date + hours', () => {
    const label = formatBlockWindow({
      allDay: false,
      start: '2026-09-20T12:00:00.000Z',
      end: '2026-09-20T14:00:00.000Z',
    });
    assert.match(label, /·/);
    assert.match(label, /14:00/);
    assert.match(label, /16:00/); // 12:00–14:00 UTC = 14:00–16:00 in Madrid
  });
});

describe('rangesOverlap', () => {
  const at = (iso: string) => new Date(iso);

  test('overlapping ranges conflict', () => {
    assert.equal(
      rangesOverlap(
        { start: at('2026-09-20T12:00:00Z'), end: at('2026-09-20T14:00:00Z') },
        { start: at('2026-09-20T13:00:00Z'), end: at('2026-09-20T15:00:00Z') }
      ),
      true
    );
  });

  test('touching edges do not conflict', () => {
    assert.equal(
      rangesOverlap(
        { start: at('2026-09-20T12:00:00Z'), end: at('2026-09-20T14:00:00Z') },
        { start: at('2026-09-20T14:00:00Z'), end: at('2026-09-20T16:00:00Z') }
      ),
      false
    );
  });
});

describe('resolveBlockRange', () => {
  test('whole days snap to the day bounds (default mode)', () => {
    const result = resolveBlockRange({ start: '2026-09-20', end: '2026-09-22' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.range.start.toISOString(), '2026-09-20T00:00:00.000Z');
    assert.equal(result.range.end.toISOString(), '2026-09-22T23:59:59.999Z');
    assert.equal(result.range.partial, false);
  });

  test('a single day off is allowed', () => {
    const result = resolveBlockRange({ start: '2026-09-20', end: '2026-09-20' });
    assert.equal(result.ok, true);
  });

  test('end before start is rejected for whole days', () => {
    const result = resolveBlockRange({ start: '2026-09-22', end: '2026-09-20' });
    assert.equal(result.ok, false);
  });

  test('missing dates are rejected', () => {
    assert.equal(resolveBlockRange({ start: '2026-09-20' }).ok, false);
    assert.equal(resolveBlockRange({ start: '20-09-2026', end: '2026-09-22' }).ok, false);
  });

  test('whole-day ISO instants are stored as-is (no timezone shift)', () => {
    const result = resolveBlockRange({
      allDay: true,
      start: '2026-09-19T22:00:00.000Z', // 20 sept 00:00 in Madrid
      end: '2026-09-20T21:59:59.999Z', // 20 sept 23:59:59 in Madrid
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.range.partial, false);
    assert.equal(result.range.start.toISOString(), '2026-09-19T22:00:00.000Z');
  });

  test('a reversed ISO whole-day range is rejected', () => {
    const result = resolveBlockRange({
      allDay: true,
      start: '2026-09-20T22:00:00.000Z',
      end: '2026-09-19T22:00:00.000Z',
    });
    assert.equal(result.ok, false);
  });

  test('partial ranges keep the exact instants sent by the client', () => {
    const result = resolveBlockRange({
      allDay: false,
      start: '2026-09-20T14:00:00.000+02:00',
      end: '2026-09-20T16:00:00.000+02:00',
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.range.start.toISOString(), '2026-09-20T12:00:00.000Z');
    assert.equal(result.range.partial, true);
  });

  test('a zero-length time range is rejected', () => {
    const result = resolveBlockRange({
      allDay: false,
      start: '2026-09-20T14:00:00.000Z',
      end: '2026-09-20T14:00:00.000Z',
    });
    assert.equal(result.ok, false);
  });

  test('a reversed time range is rejected', () => {
    const result = resolveBlockRange({
      allDay: false,
      start: '2026-09-20T16:00:00.000Z',
      end: '2026-09-20T14:00:00.000Z',
    });
    assert.equal(result.ok, false);
  });

  test('partial mode refuses plain dates (they would be read as server time)', () => {
    const result = resolveBlockRange({ allDay: false, start: '2026-09-20', end: '2026-09-20' });
    assert.equal(result.ok, false);
  });
});
