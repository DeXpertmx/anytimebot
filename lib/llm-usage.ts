/**
 * DeepSeek cache-hit telemetry and per-request cost estimation.
 *
 * DeepSeek reports cache fields at the TOP level of `usage`:
 *   usage.prompt_tokens, usage.prompt_cache_hit_tokens, usage.prompt_cache_miss_tokens
 * (NOT the OpenAI-style nested `prompt_tokens_details.cached_tokens`).
 */

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export interface LlmUsageMetrics {
  model: string;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  hitRate: number; // 0..100
  costUsd: number;
}

// deepseek-chat pricing (USD per 1M tokens) — cache hits are far cheaper.
const PRICE_CACHE_HIT = 0.0028;
const PRICE_CACHE_MISS = 0.14;
const PRICE_COMPLETION = 0.28;

/**
 * Compute cache hit % and USD cost for a DeepSeek `usage` object.
 */
export function computeLlmUsage(model: string, usage: Usage): LlmUsageMetrics {
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const cacheHit = usage.prompt_cache_hit_tokens || 0;
  const cacheMiss = usage.prompt_cache_miss_tokens || 0;
  const hitRate = promptTokens > 0 ? (cacheHit / promptTokens) * 100 : 0;
  const costUsd = (cacheHit / 1_000_000) * PRICE_CACHE_HIT + (cacheMiss / 1_000_000) * PRICE_CACHE_MISS + (completionTokens / 1_000_000) * PRICE_COMPLETION;
  return {
    model,
    promptTokens,
    completionTokens,
    cacheHitTokens: cacheHit,
    cacheMissTokens: cacheMiss,
    hitRate,
    costUsd,
  };
}

/**
 * Structured log line so the SaaS can monitor cache efficiency day by day.
 */
export function logLlmUsage(metrics: LlmUsageMetrics): void {
  console.log(JSON.stringify({
    evt: 'llm.usage',
    model: metrics.model,
    prompt_tokens: metrics.promptTokens,
    completion_tokens: metrics.completionTokens,
    cache_hit_tokens: metrics.cacheHitTokens,
    cache_miss_tokens: metrics.cacheMissTokens,
    cache_hit_rate_pct: metrics.hitRate.toFixed(2),
    cost_usd: metrics.costUsd.toFixed(6),
  }));
}