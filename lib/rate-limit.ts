/**
 * In-memory sliding-window rate limiter for the public API, keyed per API key.
 *
 * Pure and dependency-free: callers inject `now` so tests never sleep.
 * Single-instance only — good enough for the current Vercel deployment scale;
 * swap the store for Redis/Upstash if we go multi-region.
 */

export const DEFAULT_RATE_LIMIT_PER_MIN = 100;
export const RATE_LIMIT_WINDOW_MS = 60_000;

function resolveLimit(): number {
  const raw = parseInt(process.env.API_RATE_LIMIT_PER_MIN || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RATE_LIMIT_PER_MIN;
}

// Buckets live in module scope so the limit survives across requests in the
// same server instance. Keys are apiKeyIds (never the raw key).
const buckets = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Requests already counted in the current window (including this one when allowed). */
  current: number;
  limit: number;
  /** Milliseconds until the window fully clears; 0 when allowed. */
  retryAfterMs: number;
}

export function checkRateLimit(
  apiKeyId: string,
  now: number = Date.now(),
  limit: number = resolveLimit()
): RateLimitResult {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Evict expired timestamps.
  const prev = buckets.get(apiKeyId) || [];
  const fresh = prev.filter((ts) => ts > windowStart);

  if (fresh.length >= limit) {
    buckets.set(apiKeyId, fresh);
    const oldest = fresh[0];
    return {
      allowed: false,
      current: fresh.length,
      limit,
      retryAfterMs: Math.max(oldest + RATE_LIMIT_WINDOW_MS - now, 0),
    };
  }

  fresh.push(now);
  buckets.set(apiKeyId, fresh);

  return { allowed: true, current: fresh.length, limit, retryAfterMs: 0 };
}

/** Test helper: wipe all buckets. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Standard rate-limit response headers ( draft-8 style names used by most APIs).
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(Math.max(result.limit - result.current, 0)),
    ...(result.retryAfterMs > 0
      ? { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) }
      : {}),
  };
}
