/**
 * Tests for lib/series.ts (node:test + tsx, no network, no DB).
 */
process.env.TZ = 'Europe/Madrid'; // DST assertions are Madrid-specific; pin for determinism
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRecurrence,
  expandRecurrence,
  isValidRule,
  describeRecurrence,
  MAX_SERIES_OCCURRENCES,
  addDaysLike,
  atLocalTime,
} from '../lib/series';

const baseRule = {
  freq: 'WEEKLY' as const,
  time: '10:00',
  byWeekday: 1, // Monday
  count: 4,
};

describe('parseRecurrence', () => {
  test('accepts a valid rule', () => {
    assert.ok(parseRecurrence(baseRule));
  });

  test('rejects invalid freq / time / weekday / count', () => {
    assert.equal(parseRecurrence({ ...baseRule, freq: 'DAILY' }), null);
    assert.equal(parseRecurrence({ ...baseRule, time: '25:00' }), null);
    assert.equal(parseRecurrence({ ...baseRule, time: '10:5' }), null);
    assert.equal(parseRecurrence({ ...baseRule, byWeekday: 7 }), null);
    assert.equal(parseRecurrence({ ...baseRule, count: 0 }), null);
    assert.equal(parseRecurrence({ ...baseRule, count: MAX_SERIES_OCCURRENCES + 1 }), null);
    assert.equal(parseRecurrence(null), null);
    assert.equal(parseRecurrence('weekly'), null);
  });

  test('accepts BIWEEKLY and boundary counts', () => {
    assert.ok(parseRecurrence({ ...baseRule, freq: 'BIWEEKLY', count: 1 }));
    assert.ok(parseRecurrence({ ...baseRule, count: MAX_SERIES_OCCURRENCES }));
  });
});

describe('expandRecurrence', () => {
  test('weekly series produces count occurrences 7 days apart', () => {
    const first = atLocalTime(new Date(2026, 0, 5), '10:00'); // Monday Jan 5, 2026
    const out = expandRecurrence({ ...baseRule, count: 3 }, { firstStart: first });
    assert.equal(out.length, 3);
    assert.equal(out[0].getDay(), 1);
    assert.equal(out[1].getTime() - out[0].getTime(), 7 * 24 * 3600 * 1000);
    assert.equal(out[2].getTime() - out[1].getTime(), 7 * 24 * 3600 * 1000);
  });

  test('biweekly series is 14 days apart', () => {
    const first = atLocalTime(new Date(2026, 0, 5), '10:00');
    const out = expandRecurrence({ ...baseRule, freq: 'BIWEEKLY', count: 3 }, { firstStart: first });
    assert.equal(out[1].getTime() - out[0].getTime(), 14 * 24 * 3600 * 1000);
  });

  test('firstStart is respected verbatim (even if weekday mismatches rule)', () => {
    const first = atLocalTime(new Date(2026, 0, 6), '09:30'); // Tuesday
    const out = expandRecurrence({ ...baseRule, count: 2 }, { firstStart: first });
    assert.equal(out[0].getHours(), 9);
    assert.equal(out[0].getMinutes(), 30);
    assert.equal(out[0].getDate(), 6);
  });

  test('DST spring-forward: wall clock time stays 10:00 local', () => {
    // Spain (Europe/Madrid): DST starts Sun 29 Mar 2026 (2:00 -> 3:00).
    // A Monday 10:00 series crossing that boundary must keep 10:00 local.
    const first = atLocalTime(new Date(2026, 2, 23), '10:00'); // Monday Mar 23
    const out = expandRecurrence({ ...baseRule, count: 3 }, { firstStart: first });
    // Occurrences: Mar 23 (CET, UTC+1), Mar 30 (CEST, UTC+2), Apr 6 (CEST)
    for (const d of out) {
      assert.equal(d.getHours(), 10, `local hour must stay 10 for ${d.toISOString()}`);
    }
    // UTC instants must be exactly 7*24h apart only if no DST shift; here they differ by 7*24h-1h between 1st and 2nd
    const deltaHours = (out[1].getTime() - out[0].getTime()) / 3600000;
    assert.equal(deltaHours, 167); // 7*24 - 1 due to spring forward
  });

  test('DST fall-back: wall clock stays and UTC delta is 169h', () => {
    // Europe/Madrid: DST ends Sun 25 Oct 2026 (3:00 -> 2:00).
    const first = atLocalTime(new Date(2026, 9, 19), '10:00'); // Monday Oct 19
    const out = expandRecurrence({ ...baseRule, count: 2 }, { firstStart: first });
    for (const d of out) assert.equal(d.getHours(), 10);
    const deltaHours = (out[1].getTime() - out[0].getTime()) / 3600000;
    assert.equal(deltaHours, 169); // 7*24 + 1 due to fall back
  });

  test('auto-computes first occurrence when omitted (next matching weekday, today included)', () => {
    // Wed 2026-01-07 12:00 local. Rule: Monday 10:00.
    const now = new Date(2026, 0, 7, 12, 0, 0);
    const out = expandRecurrence({ ...baseRule, count: 2 }, { now });
    assert.equal(out.length, 2);
    assert.equal(out[0].getDay(), 1); // Monday
    assert.equal(out[0].getDate(), 12); // next Monday Jan 12
    assert.equal(out[0].getHours(), 10);
  });

  test('same-weekday today is included as first occurrence', () => {
    // Mon 2026-01-05 08:00 local, rule Monday 10:00 -> first is today 10:00.
    const now = new Date(2026, 0, 5, 8, 0, 0);
    const out = expandRecurrence({ ...baseRule, count: 1 }, { now });
    assert.equal(out[0].getDate(), 5);
    assert.equal(out[0].getHours(), 10);
  });

  test('never returns occurrences in the past when now is before matching day', () => {
    const now = new Date(2026, 0, 7, 12, 0, 0);
    const out = expandRecurrence({ ...baseRule, count: 5 }, { now });
    for (const d of out) assert.ok(d.getTime() > now.getTime() || (d.getDate() === 12 && d.getHours() === 10));
  });
});

describe('describeRecurrence', () => {
  test('formats Spanish and English labels', () => {
    assert.match(describeRecurrence(baseRule, 'es'), /Cada semana · lunes, 10:00 · 4 citas/);
    assert.match(describeRecurrence(baseRule, 'en'), /Weekly · Monday, 10:00 · 4 appointments/);
    assert.match(describeRecurrence({ ...baseRule, freq: 'BIWEEKLY' }, 'es'), /Cada 2 semanas/);
  });
});

describe('helpers', () => {
  test('addDaysLike preserves wall clock across month end', () => {
    const d = new Date(2026, 0, 31, 9, 15);
    const n = addDaysLike(d, 1);
    assert.equal(n.getMonth(), 1);
    assert.equal(n.getDate(), 1);
    assert.equal(n.getHours(), 9);
    assert.equal(n.getMinutes(), 15);
  });

  test('isValidRule narrows the type', () => {
    if (isValidRule(baseRule)) {
      assert.equal(baseRule.freq, 'WEEKLY');
    } else {
      assert.fail('should be valid');
    }
  });
});
