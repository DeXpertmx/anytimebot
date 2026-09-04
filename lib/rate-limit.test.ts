import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  checkRateLimit,
  resetRateLimits,
  rateLimitHeaders,
  RATE_LIMIT_WINDOW_MS,
} from './rate-limit';

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('allows requests under the limit', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit('key-a', t0 + i, 5);
      assert.equal(r.allowed, true);
    }
  });

  it('blocks the request that exceeds the window limit', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      checkRateLimit('key-b', t0 + i, 5);
    }
    const blocked = checkRateLimit('key-b', t0 + 5, 5);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.current, 5);
    assert.equal(blocked.limit, 5);
  });

  it('reports retryAfterMs until the oldest request leaves the window', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('key-c', t0 + i, 3);

    const blocked = checkRateLimit('key-c', t0 + 3, 3);
    assert.equal(blocked.allowed, false);
    // Oldest request at t0 leaves the window at t0 + WINDOW (now is t0+3).
    assert.equal(blocked.retryAfterMs, RATE_LIMIT_WINDOW_MS - 3);

    // After the window slides past the oldest request, one slot frees up.
    const afterWindow = checkRateLimit('key-c', t0 + RATE_LIMIT_WINDOW_MS + 1, 3);
    assert.equal(afterWindow.allowed, true);
  });

  it('limits are independent per API key', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('key-d', t0 + i, 3);
    const other = checkRateLimit('key-e', t0, 3);
    assert.equal(other.allowed, true);
    assert.equal(other.current, 1);
  });

  it('expired entries are evicted, so an idle key can burst again', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) checkRateLimit('key-f', t0 + i, 3);
    assert.equal(checkRateLimit('key-f', t0 + 5, 3).allowed, false);
    // Long after the window cleared, the bucket is empty again.
    const muchLater = checkRateLimit('key-f', t0 + RATE_LIMIT_WINDOW_MS * 10, 3);
    assert.equal(muchLater.allowed, true);
    assert.equal(muchLater.current, 1);
  });

  it('rateLimitHeaders exposes limit, remaining and Retry-After', () => {
    const t0 = 1_000_000;
    const ok = checkRateLimit('key-g', t0, 10);
    assert.deepEqual(rateLimitHeaders(ok), {
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': '9',
    });

    for (let i = 0; i < 9; i++) checkRateLimit('key-g', t0 + 1 + i, 10);
    const blocked = checkRateLimit('key-g', t0 + 10, 10);
    const headers = rateLimitHeaders(blocked);
    assert.equal(headers['X-RateLimit-Limit'], '10');
    assert.equal(headers['X-RateLimit-Remaining'], '0');
    assert.equal(headers['Retry-After'], '60'); // ceil of remaining window seconds
  });
});
