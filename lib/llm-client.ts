/**
 * Shared LLM client.
 *
 * OrcaRouter is the primary provider; DeepSeek is the fallback. Both speak the
 * OpenAI-compatible chat completions protocol, so the same payload works for
 * both. Keys are read from env (never hardcoded).
 */

import { computeLlmUsage, logLlmUsage } from '@/lib/llm-usage';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type CompleteChatParams = {
  messages: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
};

type Provider = {
  url: string;
  apiKey: string;
  model: string;
};

const DEEPSEEK_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com/chat/completions';
const ORCAROUTER_URL = process.env.ORCAROUTER_BASE_URL || 'https://api.orcarouter.ai/v1/chat/completions';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Exponential backoff with jitter for 429 (rate limit). Keeps bursts from
// hammering the API and keeps the shared cache prefix warm.
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= attempts) {
      return res;
    }
    const base = 500 * 2 ** (attempt - 1);
    const delay = base + Math.random() * base;
    await sleep(delay);
  }
}

// OrcaRouter is the primary provider; DeepSeek is the fallback.
function resolveProviders(): Provider[] {
  const providers: Provider[] = [];
  const orcaKey = process.env.ORCAROUTER_API_KEY || process.env.LLM_API_KEY;
  const deepKey = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;
  if (orcaKey) {
    providers.push({
      url: ORCAROUTER_URL,
      apiKey: orcaKey,
      model: process.env.ORCAROUTER_MODEL || 'orcarouter/free',
    });
  }
  if (deepKey) {
    providers.push({
      url: DEEPSEEK_URL,
      apiKey: deepKey,
      model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    });
  }
  // Fallback: a generic LLM_API_KEY with no provider-specific var.
  if (providers.length === 0 && process.env.LLM_API_KEY) {
    providers.push({
      url: DEEPSEEK_URL,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL || 'deepseek-v4-flash',
    });
  }
  return providers;
}

/**
 * Calls the configured LLM providers in order (OrcaRouter → DeepSeek) and
 * returns the first successful completion. Throws if none succeed.
 */
export async function completeChat(params: CompleteChatParams): Promise<string> {
  const providers = resolveProviders();
  if (providers.length === 0) {
    throw new Error('LLM is not configured: missing API key');
  }

  const basePayload = {
    messages: params.messages,
    max_tokens: params.maxTokens ?? 1000,
    temperature: params.temperature ?? 0.7,
  };

  // Try the primary provider first, then fall back to the next one.
  let lastError: unknown = null;
  for (const provider of providers) {
    try {
      return await callProvider(provider, { ...basePayload, model: provider.model });
    } catch (error) {
      lastError = error;
      console.error(`LLM provider failed (${provider.model}):`, error);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('All LLM providers failed');
}

async function callProvider(provider: Provider, payload: Record<string, unknown>): Promise<string> {
  const response = await fetchWithRetry(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`LLM request failed (${provider.url}, ${response.status}): ${details}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('LLM returned an empty response');
  }

  // Telemetry only for DeepSeek, which exposes top-level cache fields. OrcaRouter
  // uses the standard OpenAI shape, so computeLlmUsage may read zeroed cache —
  // cheap and harmless, still records token/cost baselines.
  try {
    if (data.usage) {
      logLlmUsage(computeLlmUsage(payload.model as string, data.usage));
    }
  } catch (e) {
    // Telemetry must never break the response.
  }

  return content
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2');
}