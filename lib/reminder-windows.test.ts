/**
 * Tests for lib/reminder-windows.ts (node:test + tsx, pure, no DB).
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  window24h,
  window1h,
  REMINDER_WINDOW_MINUTES,
  REMINDER_PAST_GRACE_MINUTES,
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
});
