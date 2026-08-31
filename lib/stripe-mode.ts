// Stripe operation mode — 'test' | 'live'.
//
// The active mode is persisted in the SystemSetting table (key: "stripe.mode")
// and changed from the admin panel, so switching between test and production
// does not require environment changes or redeploys.
//
// Environment variables are resolved per mode:
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

export function getStripeKeys(mode: StripeMode): {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
} {
  const suffix = mode === 'test' ? '_TEST' : '_LIVE';
  const secretKey =
    process.env[`STRIPE_SECRET_KEY${suffix}`] ||
    (mode === 'live' ? process.env.STRIPE_SECRET_KEY : undefined) ||
    '';
  const publishableKey =
    process.env[`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY${suffix}`] ||
    (mode === 'live' ? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY : undefined) ||
    '';
  const webhookSecret =
    process.env[`STRIPE_WEBHOOK_SECRET${suffix}`] ||
    (mode === 'live' ? process.env.STRIPE_WEBHOOK_SECRET : undefined) ||
    '';
  return { secretKey, publishableKey, webhookSecret };
}

export function isModeConfigured(mode: StripeMode): boolean {
  const keys = getStripeKeys(mode);
  return Boolean(keys.secretKey && keys.publishableKey && keys.webhookSecret);
}

export function getStripePriceId(mode: StripeMode, plan: 'PRO' | 'TEAM'): string | undefined {
  const suffix = mode === 'test' ? '_TEST' : '_LIVE';
  const varName = `STRIPE_PRICE_${plan}${suffix}`;
  return (
    process.env[varName] ||
    (mode === 'live' ? process.env[`STRIPE_PRICE_${plan}`] : undefined) ||
    undefined
  );
}

/**
 * Reads the active Stripe mode from SystemSetting. Defaults to 'live' so that
 * environments that have never switched modes behave exactly as before.
 */
export async function getStripeMode(): Promise<StripeMode> {
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
export function getWebhookSecretCandidates(): Array<{ mode: StripeMode; secret: string }> {
  const candidates: Array<{ mode: StripeMode; secret: string }> = [];
  for (const mode of ['live', 'test'] as StripeMode[]) {
    const secret = getStripeKeys(mode).webhookSecret;
    if (secret) {
      candidates.push({ mode, secret });
    }
  }
  return candidates;
}