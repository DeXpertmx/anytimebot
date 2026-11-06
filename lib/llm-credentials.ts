// AI provider credentials, editable from the admin panel.
//
// Stored in SystemSetting (key "llm.credentials") so keys can be rotated from
// /admin/settings without touching environment variables or redeploying. Stored
// values take precedence over the environment, field by field:
//
//   provider   -> LLM_PROVIDER            ('deepseek' | 'orcarouter' | 'auto')
//   deepseek   -> DEEPSEEK_API_KEY / LLM_API_KEY, LLM_MODEL
//   orcarouter -> ORCAROUTER_API_KEY / LLM_API_KEY, ORCAROUTER_MODEL
//
// API keys are never returned by the admin API: only whether each provider is
// configured, its model and where the key came from.
//
// The Prisma client is imported lazily so unit tests (and any code path without
// DATABASE_URL) never construct it.

import type { Prisma } from '@prisma/client';

export type LlmProviderId = 'deepseek' | 'orcarouter';
export type LlmProviderPreference = LlmProviderId | 'auto';

export interface LlmProviderCredentials {
  apiKey?: string;
  model?: string;
}

export interface StoredLlmCredentials {
  provider?: LlmProviderPreference;
  deepseek?: LlmProviderCredentials;
  orcarouter?: LlmProviderCredentials;
}

export interface ResolvedProviderCredentials {
  apiKey: string;
  model: string;
  source: 'database' | 'env' | 'none';
}

export interface ResolvedLlmCredentials {
  provider: LlmProviderPreference;
  deepseek: ResolvedProviderCredentials;
  orcarouter: ResolvedProviderCredentials;
}

export interface LlmCredentialStatus {
  provider: LlmProviderPreference;
  providerSource: 'database' | 'env' | 'default';
  active: LlmProviderId | null;
  deepseek: { configured: boolean; model: string; source: 'database' | 'env' | 'none' };
  orcarouter: { configured: boolean; model: string; source: 'database' | 'env' | 'none' };
  stored: boolean;
}

const CREDENTIALS_KEY = 'llm.credentials';

export const DEFAULT_LLM_MODELS: Record<LlmProviderId, string> = {
  deepseek: 'deepseek-v4-flash',
  orcarouter: 'orcarouter/free',
};

async function getDb() {
  const { prisma } = await import('@/lib/db');
  return prisma;
}

/**
 * Pure merge used by the admin save: empty strings keep the stored value, an
 * empty model clears the override, provider "auto" removes the preference.
 * Returns null when nothing is left to store.
 */
export function mergeLlmCredentials(
  existing: StoredLlmCredentials,
  patch: StoredLlmCredentials,
): StoredLlmCredentials | null {
  const next: StoredLlmCredentials = { ...existing };

  if (patch.provider === 'auto') {
    delete next.provider;
  } else if (patch.provider === 'deepseek' || patch.provider === 'orcarouter') {
    next.provider = patch.provider;
  }

  for (const id of ['deepseek', 'orcarouter'] as LlmProviderId[]) {
    const incoming = patch[id];
    if (!incoming) continue;
    const merged: LlmProviderCredentials = { ...(existing[id] ?? {}) };
    if (typeof incoming.apiKey === 'string' && incoming.apiKey.trim() !== '') {
      merged.apiKey = incoming.apiKey.trim();
    }
    if (typeof incoming.model === 'string') {
      if (incoming.model.trim() !== '') merged.model = incoming.model.trim();
      else delete merged.model;
    }
    if (merged.apiKey || merged.model) next[id] = merged;
    else delete next[id];
  }

  return next.provider || next.deepseek || next.orcarouter ? next : null;
}

/** Reads the admin-saved credentials. Returns null when nothing is stored. */
export async function getStoredLlmCredentials(): Promise<StoredLlmCredentials | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const prisma = await getDb();
    const row = await prisma.systemSetting.findUnique({
      where: { key: CREDENTIALS_KEY },
      select: { value: true },
    });
    if (!row) return null;
    const value = row.value as unknown;
    if (typeof value !== 'object' || value === null) return null;
    return value as StoredLlmCredentials;
  } catch (error) {
    console.warn('Could not read saved LLM credentials:', error);
    return null;
  }
}

/** Persists credentials from the admin panel (empty fields keep stored values). */
export async function saveLlmCredentials(patch: StoredLlmCredentials): Promise<void> {
  const prisma = await getDb();
  const existing = (await getStoredLlmCredentials()) ?? {};
  const next = mergeLlmCredentials(existing, patch);

  if (!next) {
    await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
    return;
  }

  const value = next as unknown as Prisma.InputJsonValue;
  await prisma.systemSetting.upsert({
    where: { key: CREDENTIALS_KEY },
    create: { key: CREDENTIALS_KEY, value },
    update: { value },
  });
}

/** Removes the admin-saved credentials (falls back to env vars). */
export async function clearLlmCredentials(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const prisma = await getDb();
  await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
}

/**
 * Merges stored credentials with the environment. The database wins per field,
 * so existing env-based deployments keep working unchanged.
 */
export async function getLlmCredentials(): Promise<ResolvedLlmCredentials> {
  const stored = (await getStoredLlmCredentials()) ?? {};

  const deepKeyEnv = process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY || '';
  const orcaKeyEnv = process.env.ORCAROUTER_API_KEY || process.env.LLM_API_KEY || '';

  const deepKey = stored.deepseek?.apiKey || deepKeyEnv;
  const orcaKey = stored.orcarouter?.apiKey || orcaKeyEnv;

  const envPreference = (process.env.LLM_PROVIDER || '').trim().toLowerCase();
  const provider: LlmProviderPreference =
    stored.provider ??
    (envPreference === 'deepseek' || envPreference === 'orcarouter' ? envPreference : 'auto');

  return {
    provider,
    deepseek: {
      apiKey: deepKey,
      model: stored.deepseek?.model || process.env.LLM_MODEL || DEFAULT_LLM_MODELS.deepseek,
      source: stored.deepseek?.apiKey ? 'database' : deepKeyEnv ? 'env' : 'none',
    },
    orcarouter: {
      apiKey: orcaKey,
      model:
        stored.orcarouter?.model || process.env.ORCAROUTER_MODEL || DEFAULT_LLM_MODELS.orcarouter,
      source: stored.orcarouter?.apiKey ? 'database' : orcaKeyEnv ? 'env' : 'none',
    },
  };
}

/** Never expose a key: keeps at most the last 4 characters. */
export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 4) return '••••';
  return `••••${trimmed.slice(-4)}`;
}

/** Masked status for the admin API (no key material). */
export async function getLlmCredentialStatus(): Promise<LlmCredentialStatus> {
  const stored = await getStoredLlmCredentials();
  const resolved = await getLlmCredentials();
  const envPreference = (process.env.LLM_PROVIDER || '').trim().toLowerCase();

  const active: LlmProviderId | null =
    resolved.provider === 'deepseek' && resolved.deepseek.apiKey
      ? 'deepseek'
      : resolved.provider === 'orcarouter' && resolved.orcarouter.apiKey
        ? 'orcarouter'
        : resolved.orcarouter.apiKey
          ? 'orcarouter'
          : resolved.deepseek.apiKey
            ? 'deepseek'
            : null;

  return {
    provider: resolved.provider,
    providerSource: stored?.provider
      ? 'database'
      : envPreference === 'deepseek' || envPreference === 'orcarouter'
        ? 'env'
        : 'default',
    active,
    deepseek: {
      configured: Boolean(resolved.deepseek.apiKey),
      model: resolved.deepseek.model,
      source: resolved.deepseek.source,
    },
    orcarouter: {
      configured: Boolean(resolved.orcarouter.apiKey),
      model: resolved.orcarouter.model,
      source: resolved.orcarouter.source,
    },
    stored: Boolean(stored),
  };
}
