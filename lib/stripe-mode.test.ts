import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStripeKeys,
  isModeConfigured,
  getStripePriceId,
  getWebhookSecretCandidates,
} from '@/lib/stripe-mode';
import { getSubscriptionPeriodEnd } from '@/lib/stripe';

const OLD_ENV = process.env;

test('stripe-mode: resolves legacy live variables as fallback', async () => {
  process.env = { ...OLD_ENV };
  process.env.DATABASE_URL = '';
  process.env.STRIPE_SECRET_KEY = 'sk_live_legacy';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_legacy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_legacy';
  process.env.STRIPE_PRICE_PRO = 'price_live_pro';
  process.env.STRIPE_PRICE_TEAM = 'price_live_team';
  delete process.env.STRIPE_SECRET_KEY_LIVE;
  delete process.env.STRIPE_SECRET_KEY_TEST;
  delete process.env.STRIPE_WEBHOOK_SECRET_TEST;

  const keys = await getStripeKeys('live');
  assert.equal(keys.secretKey, 'sk_live_legacy');
  assert.equal(keys.publishableKey, 'pk_live_legacy');
  assert.equal(keys.webhookSecret, 'whsec_live_legacy');
  assert.equal(await getStripePriceId('live', 'PRO'), 'price_live_pro');
  assert.equal(await getStripePriceId('live', 'TEAM'), 'price_live_team');
  assert.equal(await isModeConfigured('live'), true);
  process.env = OLD_ENV;
});

test('stripe-mode: prefers explicit _LIVE variables over legacy names', async () => {
  process.env = { ...OLD_ENV };
  process.env.DATABASE_URL = '';
  process.env.STRIPE_SECRET_KEY_LIVE = 'sk_live_explicit';
  process.env.STRIPE_SECRET_KEY = 'sk_live_legacy';
  assert.equal((await getStripeKeys('live')).secretKey, 'sk_live_explicit');
  process.env = OLD_ENV;
});

test('stripe-mode: test mode requires _TEST variables and never falls back to live', async () => {
  process.env = { ...OLD_ENV };
  process.env.DATABASE_URL = '';
  delete process.env.STRIPE_SECRET_KEY_TEST;
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST;
  delete process.env.STRIPE_WEBHOOK_SECRET_TEST;
  assert.equal((await getStripeKeys('test')).secretKey, '');
  assert.equal(await isModeConfigured('test'), false);
  process.env = OLD_ENV;
});

test('stripe-mode: resolves _TEST variables when configured', async () => {
  process.env = { ...OLD_ENV };
  process.env.DATABASE_URL = '';
  process.env.STRIPE_SECRET_KEY_TEST = 'sk_test_1';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST = 'pk_test_1';
  process.env.STRIPE_WEBHOOK_SECRET_TEST = 'whsec_test_1';
  process.env.STRIPE_PRICE_PRO_TEST = 'price_test_pro';
  process.env.STRIPE_PRICE_TEAM_TEST = 'price_test_team';

  assert.equal((await getStripeKeys('test')).secretKey, 'sk_test_1');
  assert.equal(await getStripePriceId('test', 'PRO'), 'price_test_pro');
  assert.equal(await getStripePriceId('test', 'TEAM'), 'price_test_team');
  assert.equal(await isModeConfigured('test'), true);

  process.env = OLD_ENV;
});

test('stripe-mode: webhook candidates include each configured mode once, live first', async () => {
  process.env = { ...OLD_ENV };
  process.env.DATABASE_URL = '';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
  process.env.STRIPE_WEBHOOK_SECRET_TEST = 'whsec_test';

  const candidates = await getWebhookSecretCandidates();
  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((c) => c.mode),
    ['live', 'test'],
  );
  assert.equal(candidates[0].secret, 'whsec_live');
  assert.equal(candidates[1].secret, 'whsec_test');
  process.env = OLD_ENV;
});

test('stripe-mode: candidates skip modes without a webhook secret', async () => {
  process.env = { ...OLD_ENV };
  process.env.DATABASE_URL = '';
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET_LIVE;
  process.env.STRIPE_WEBHOOK_SECRET_TEST = 'whsec_test';

  const candidates = await getWebhookSecretCandidates();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].mode, 'test');
  process.env = OLD_ENV;
});

test('stripe-mode: helpers handle empty saved credential objects', async () => {
  process.env = { ...OLD_ENV };
  process.env.DATABASE_URL = '';
  const keys = await getStripeKeys('test');
  assert.equal(typeof keys.secretKey, 'string');
  assert.equal(typeof keys.publishableKey, 'string');
  process.env = OLD_ENV;
});

test('stripe: computes period end from current_period_end when present', () => {
  const sub: any = { current_period_end: 1000 };
  assert.equal(getSubscriptionPeriodEnd(sub), 1000);
});

test('stripe: derives period end from billing_cycle_anchor and month interval', () => {
  const anchor = 1788220266;
  const sub: any = {
    billing_cycle_anchor: anchor,
    items: { data: [{ price: { recurring: { interval: 'month', interval_count: 1 } } }] },
  };
  assert.equal(getSubscriptionPeriodEnd(sub), anchor + 30 * 86400);
});

test('stripe: returns null when neither period end nor anchor exists', () => {
  const sub: any = {};
  assert.equal(getSubscriptionPeriodEnd(sub), null);
});

test('stripe: respects interval_count', () => {
  const anchor = 1000;
  const sub: any = {
    billing_cycle_anchor: anchor,
    items: { data: [{ price: { recurring: { interval: 'week', interval_count: 2 } } }] },
  };
  assert.equal(getSubscriptionPeriodEnd(sub), anchor + 2 * 7 * 86400);
});