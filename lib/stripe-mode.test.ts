import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStripeKeys,
  isModeConfigured,
  getStripePriceId,
  getWebhookSecretCandidates,
} from '@/lib/stripe-mode';

const OLD_ENV = process.env;

test('stripe-mode: resolves legacy live variables as fallback', () => {
  process.env = { ...OLD_ENV };
  process.env.STRIPE_SECRET_KEY = 'sk_live_legacy';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_live_legacy';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live_legacy';
  process.env.STRIPE_PRICE_PRO = 'price_live_pro';
  process.env.STRIPE_PRICE_TEAM = 'price_live_team';
  delete process.env.STRIPE_SECRET_KEY_LIVE;
  delete process.env.STRIPE_SECRET_KEY_TEST;
  delete process.env.STRIPE_WEBHOOK_SECRET_TEST;

  const keys = getStripeKeys('live');
  assert.equal(keys.secretKey, 'sk_live_legacy');
  assert.equal(keys.publishableKey, 'pk_live_legacy');
  assert.equal(keys.webhookSecret, 'whsec_live_legacy');
  assert.equal(getStripePriceId('live', 'PRO'), 'price_live_pro');
  assert.equal(getStripePriceId('live', 'TEAM'), 'price_live_team');
  assert.equal(isModeConfigured('live'), true);
  process.env = OLD_ENV;
});

test('stripe-mode: prefers explicit _LIVE variables over legacy names', () => {
  process.env = { ...OLD_ENV };
  process.env.STRIPE_SECRET_KEY_LIVE = 'sk_live_explicit';
  process.env.STRIPE_SECRET_KEY = 'sk_live_legacy';
  assert.equal(getStripeKeys('live').secretKey, 'sk_live_explicit');
  process.env = OLD_ENV;
});

test('stripe-mode: test mode requires _TEST variables and never falls back to live', () => {
  process.env = { ...OLD_ENV };
  delete process.env.STRIPE_SECRET_KEY_TEST;
  delete process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST;
  delete process.env.STRIPE_WEBHOOK_SECRET_TEST;
  assert.equal(getStripeKeys('test').secretKey, '');
  assert.equal(isModeConfigured('test'), false);
  process.env = OLD_ENV;
});

test('stripe-mode: resolves _TEST variables when configured', () => {
  process.env = { ...OLD_ENV };
  process.env.STRIPE_SECRET_KEY_TEST = 'sk_test_1';
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST = 'pk_test_1';
  process.env.STRIPE_WEBHOOK_SECRET_TEST = 'whsec_test_1';
  process.env.STRIPE_PRICE_PRO_TEST = 'price_test_pro';
  process.env.STRIPE_PRICE_TEAM_TEST = 'price_test_team';

  assert.equal(getStripeKeys('test').secretKey, 'sk_test_1');
  assert.equal(getStripePriceId('test', 'PRO'), 'price_test_pro');
  assert.equal(getStripePriceId('test', 'TEAM'), 'price_test_team');
  assert.equal(isModeConfigured('test'), true);

  process.env = OLD_ENV;
});

test('stripe-mode: webhook candidates include each configured mode once, live first', () => {
  process.env = { ...OLD_ENV };
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_live';
  process.env.STRIPE_WEBHOOK_SECRET_TEST = 'whsec_test';

  const candidates = getWebhookSecretCandidates();
  assert.equal(candidates.length, 2);
  assert.deepEqual(
    candidates.map((c) => c.mode),
    ['live', 'test'],
  );
  assert.equal(candidates[0].secret, 'whsec_live');
  assert.equal(candidates[1].secret, 'whsec_test');
  process.env = OLD_ENV;
});

test('stripe-mode: candidates skip modes without a webhook secret', () => {
  process.env = { ...OLD_ENV };
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_WEBHOOK_SECRET_LIVE;
  process.env.STRIPE_WEBHOOK_SECRET_TEST = 'whsec_test';

  const candidates = getWebhookSecretCandidates();
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].mode, 'test');
  process.env = OLD_ENV;
});