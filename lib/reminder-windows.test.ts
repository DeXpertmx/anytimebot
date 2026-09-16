/**
 * Tests for lib/reminder-windows.ts (node:test + tsx, pure, no DB).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  window24h,
  window1h,
  window24hDaily,
  REMINDER_WINDOW_MINUTES,
  REMINDER_PAST_GRACE_MINUTES,
  DAILY_SWEEP_MIN_HOURS,
  DAILY_SWEEP_MAX_HOURS,
} from './reminder-windows';

const MIN = 60_000;

describe('reminder windows', () => {
  const now = new Date('2026-09-16T09:00:00.000Z');

  test('24h window spans ±60 minutes around T-24h', () => {
    const w = window24h(now);
    assert.equal(w.from.getTime(), now.getTime() + (24 * 60 - 60) * MIN);
    assert.equal(w.to.getTime(), now.getTime() + (24 * 60 + 60) * MIN);
  });

  test('1h window spans T-60m .. T+grace', () => {
    const w = window1h(now);
    assert.equal(w.from.getTime(), now.getTime() - 10 * MIN);
    assert.equal(w.to.getTime(), now.getTime() + 60 * MIN);
  });

  test('booking 24h ahead falls inside the 24h window', () => {
    const booking = new Date(now.getTime() + 24 * 60 * MIN);
    const w = window24h(now);
    assert.ok(booking >= w.from && booking <= w.to);
  });

  test('booking 25h30m ahead is caught by the NEXT hourly run (continuous sweep)', () => {
    const booking = new Date(now.getTime() + 25.5 * 60 * MIN);
    const w = window24h(now); // this run: [now+23h, now+25h] — not yet
    assert.ok(booking > w.to);
    const wNext = window24h(new Date(now.getTime() + 60 * MIN)); // next run: [now+24h, now+26h]
    assert.ok(booking >= wNext.from && booking <= wNext.to);
  });

  test('booking 23h ahead falls inside the current 24h window', () => {
    const booking = new Date(now.getTime() + 23 * 60 * MIN);
    const w = window24h(now);
    assert.ok(booking >= w.from && booking <= w.to);
  });

  test('booking 22h ahead is NOT yet in the 24h window', () => {
    const booking = new Date(now.getTime() + 22 * 60 * MIN);
    const w = window24h(now);
    assert.ok(booking < w.from);
  });

  test('booking that started 5 minutes ago is caught by the 1h window (grace)', () => {
    const booking = new Date(now.getTime() - 5 * MIN);
    const w = window1h(now);
    assert.ok(booking >= w.from && booking <= w.to);
  });

  test('booking that started 30 minutes ago is NOT caught (grace respected)', () => {
    const booking = new Date(now.getTime() - 30 * MIN);
    const w = window1h(now);
    assert.ok(booking < w.from);
  });

  test('booking starting in 30 minutes falls inside the 1h window', () => {
    const booking = new Date(now.getTime() + 30 * MIN);
    const w = window1h(now);
    assert.ok(booking >= w.from && booking <= w.to);
  });

  test('window constants are as documented', () => {
    assert.equal(REMINDER_WINDOW_MINUTES, 60);
    assert.equal(REMINDER_PAST_GRACE_MINUTES, 10);
  });

  describe('daily sweep (Hobby-plan daily crons)', () => {
    test('covers [now+12h, now+36h]', () => {
      const w = window24hDaily(now);
      assert.equal(w.from.getTime(), now.getTime() + 12 * 60 * MIN);
      assert.equal(w.to.getTime(), now.getTime() + 36 * 60 * MIN);
    });

    test('booking 25h30m ahead falls inside the sweep (was missed by fixed ±1h)', () => {
      const booking = new Date(now.getTime() + 25.5 * 60 * MIN);
      const w = window24hDaily(now);
      assert.ok(booking >= w.from && booking <= w.to);
    });

    test('consecutive daily runs tile the timeline with no gaps', () => {
      const run1 = window24hDaily(now); // [12h, 36h]
      const run2 = window24hDaily(new Date(now.getTime() + 24 * 60 * MIN)); // [36h, 60h]
      const booking = new Date(now.getTime() + 36 * 60 * MIN); // exactly at the seam
      assert.equal(run1.to.getTime(), run2.from.getTime());
      assert.ok(booking >= run1.from && booking <= run1.to);
    });

    test('booking 11h ahead is NOT yet in the sweep (next run catches it)', () => {
      const booking = new Date(now.getTime() + 11 * 60 * MIN);
      const w = window24hDaily(now);
      assert.ok(booking < w.from);
    });

    test('booking 40h ahead is NOT yet in the sweep', () => {
      const booking = new Date(now.getTime() + 40 * 60 * MIN);
      const w = window24hDaily(now);
      assert.ok(booking > w.to);
      // ...but the run 24h later covers [36h, 60h] and catches it.
      const next = window24hDaily(new Date(now.getTime() + 24 * 60 * MIN));
      assert.ok(booking >= next.from && booking <= next.to);
    });

    test('sweep constants are as documented', () => {
      assert.equal(DAILY_SWEEP_MIN_HOURS, 12);
      assert.equal(DAILY_SWEEP_MAX_HOURS, 36);
    });
  });
});
