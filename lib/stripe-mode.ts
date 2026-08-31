// Stripe operation mode — 'test' | 'live'.
//
// The active mode is persisted in the SystemSetting table (key: "stripe.mode")
// and changed from the admin panel, so switching between test and production
// does not require environment changes or redeploys.
//
// Credentials (secret key, publishable key, webhook secret and price IDs) can
// also be configured from the admin panel. When saved (SystemSetting key
// "stripe.credentials"), the stored values take precedence over environment
// variables:
//   Live: STRIPE_SECRET_KEY_LIVE / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE /
//         STRIPE_WEBHOOK_SECRET_LIVE / STRIPE_PRICE_PRO_LIVE / STRIPE_PRICE_TEAM_LIVE
//   Test: STRIPE_SECRET_KEY_TEST / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST /
//         STRIPE_WEBHOOK_SECRET_TEST / STRIPE_PRICE_PRO_TEST / STRIPE_PRICE_TEAM_TEST
//
// The legacy unprefixed variables (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
// STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_TEAM) are used as the live
// fallback, which keeps existing deployments working unchanged.

import { prisma } from '@/lib/db';

export type StripeMode = 'test' | 'live';

const MODE_KEY = 'stripe.mode';
const CREDENTIALS_KEY = 'stripe.credentials';

export interface StripeModeCredentials {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  pricePro: string;
  priceTeam: string;
}

type StoredCredentials = Partial<Record<StripeMode, Partial<StripeModeCredentials>>>;

/** Reads the saved admin credentials. Returns null when nothing is stored. */
async function getCredentialsRecord(): Promise<StoredCredentials | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: CREDENTIALS_KEY },
      select: { value: true },
    });
    if (!row) return null;
    const value = row.value as unknown;
    if (typeof value !== 'object' || value === null) return null;
    return value as StoredCredentials;
  } catch (error) {
    console.warn('Could not read saved Stripe credentials:', error);
    return null;
  }
}

/** Persists credentials for one mode (admin panel). Empty fields keep stored values. */
export async function saveStripeCredentials(
  mode: StripeMode,
  creds: Partial<StripeModeCredentials>,
): Promise<void> {
  const existing = (await getCredentialsRecord()) ?? {};
  const current: Partial<StripeModeCredentials> = existing[mode] ?? {};

  const next: Partial<StripeModeCredentials> = {};
  (Object.keys(creds) as Array<keyof StripeModeCredentials>).forEach((key) => {
    if (typeof creds[key] === 'string' && creds[key] !== '') {
      next[key] = (creds[key] as string).trim();
    } else if (current[key]) {
      next[key] = current[key];
    }
  });

  const nextStore: StoredCredentials = {
    ...existing,
    [mode]: next,
  };

  if (!hasAny(next)) {
    delete nextStore[mode];
  }

  if (!hasAnyKey(nextStore)) {
    await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
    return;
  }

  await prisma.systemSetting.upsert({
    where: { key: CREDENTIALS_KEY },
    create: { key: CREDENTIALS_KEY, value: nextStore },
    update: { value: nextStore },
  });
}

/** Removes the admin-saved credentials for one mode (fallback to env vars). */
export async function clearStripeCredentials(mode: StripeMode): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const existing = await getCredentialsRecord();
  if (!existing) return;
  delete existing[mode];
  if (!hasAnyKey(existing)) {
    await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
    return;
  }
  await prisma.systemSetting.upsert({
    where: { key: CREDENTIALS_KEY },
    create: { key: CREDENTIALS_KEY, value: existing },
    update: { value: existing },
  });
}

export async function getStripeKeys(mode: StripeMode): Promise<{
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
}> {
  const suffix = mode === 'test' ? '_TEST' : '_LIVE';
  const env = {
    secretKey:
      process.env[`STRIPE_SECRET_KEY${suffix}`] ||
      (mode === 'live' ? process.env.STRIPE_SECRET_KEY : undefined) ||
      '',
    publishableKey:
      process.env[`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY${suffix}`] ||
      (mode === 'live' ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY : undefined) ||
      '',
    webhookSecret:
      process.env[`STRIPE_WEBHOOK_SECRET${suffix}`] ||
      (mode === 'live' ? process.env.STRIPE_WEBHOOK_SECRET : undefined) ||
      '',
  };

  const stored = (await getCredentialsRecord())?.[mode];
  if (!stored) return env;

  return {
    secretKey: stored.secretKey || env.secretKey,
    publishableKey: stored.publishableKey || env.publishableKey,
    webhookSecret: stored.webhookSecret || env.webhookSecret,
  };
}

export async function isModeConfigured(mode: StripeMode): Promise<boolean> {
  const keys = await getStripeKeys(mode);
  return Boolean(keys.secretKey && keys.publishableKey && keys.webhookSecret);
}

export async function getStripePriceId(
  mode: StripeMode,
  plan: 'PRO' | 'TEAM',
): Promise<string | undefined> {
  const suffix = mode === 'test' ? '_TEST' : '_LIVE';
  const envPrice =
    process.env[`STRIPE_PRICE_${plan}${suffix}`] ||
    (mode === 'live' ? process.env[`STRIPE_PRICE_${plan}`] : undefined) ||
    undefined;

  const stored = (await getCredentialsRecord())?.[mode];
  if (!stored) return envPrice;
  const storedPrice = plan === 'PRO' ? stored.pricePro : stored.priceTeam;
  return storedPrice || envPrice;
}

/**
 * Returns whether any admin-saved credentials exist for a mode, so the admin
 * panel can show that values are stored (and may override env vars).
 */
export async function hasStoredCredentials(mode: StripeMode): Promise<boolean> {
  const stored = (await getCredentialsRecord())?.[mode];
  return Boolean(stored && hasAny(stored));
}

/**
 * Reads the active Stripe mode from SystemSetting. Defaults to 'live' so that
 * environments that have never switched modes behave exactly as before.
 */
export async function getStripeMode(): Promise<StripeMode> {
  if (!process.env.DATABASE_URL) return 'live';
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: MODE_KEY },
      select: { value: true },
    });
    if (row && row.value === 'test') return 'test';
  } catch (error) {
    console.warn('Could not read Stripe mode, falling back to live:', error);
  }
  return 'live';
}

/** Persists the active Stripe mode. Only admins should call this. */
export async function setStripeMode(mode: StripeMode): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: MODE_KEY },
    create: { key: MODE_KEY, value: mode },
    update: { value: mode },
  });
}

/**
 * Webhook signature secrets for the modes that have one configured.
 * The webhook tries them in order and uses the first one that verifies,
 * which also tells it which mode the event belongs to.
 */
export async function getWebhookSecretCandidates(): Promise<Array<{ mode: StripeMode; secret: string }>> {
  const candidates: Array<{ mode: StripeMode; secret: string }> = [];
  for (const mode of ['live', 'test'] as StripeMode[]) {
    const secret = (await getStripeKeys(mode)).webhookSecret;
    if (secret) {
      candidates.push({ mode, secret });
    }
  }
  return candidates;
}

function hasAny(creds: Partial<StripeModeCredentials>): boolean {
  return Object.values(creds).some((value) => typeof value === 'string' && value !== '');
}

function hasAnyKey(store: StoredCredentials): boolean {
  return Object.values(store).some((creds) => creds && hasAny(creds));
}