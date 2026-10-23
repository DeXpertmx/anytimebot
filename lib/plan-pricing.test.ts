import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePaidPlan } from './plan-pricing';

const OLD_ENV = process.env;

function withEnv(vars: Record<string, string>) {
  process.env = { ...OLD_ENV, DATABASE_URL: '', ...vars };
}

test('resolvePaidPlan: matches the official price ID for each plan', async () => {
  withEnv({
    STRIPE_PRICE_FOUNDER: 'price_founder_x',
    STRIPE_PRICE_PRO: 'price_pro_x',
    STRIPE_PRICE_TEAM: 'price_team_x',
    STRIPE_PRICE_ENTERPRISE: 'price_enterprise_x',
  });

  assert.equal(await resolvePaidPlan('live', 'price_founder_x'), 'FOUNDER');
  assert.equal(await resolvePaidPlan('live', 'price_pro_x'), 'PRO');
  assert.equal(await resolvePaidPlan('live', 'price_team_x'), 'TEAM');
  assert.equal(await resolvePaidPlan('live', 'price_enterprise_x'), 'ENTERPRISE');

  process.env = OLD_ENV;
});

test('resolvePaidPlan: falls back to metadata for dynamic (reseller) prices', async () => {
  withEnv({ STRIPE_PRICE_PRO: 'price_pro_x' });

  assert.equal(await resolvePaidPlan('live', 'price_dynamic_custom', 'FOUNDER'), 'FOUNDER');
  assert.equal(await resolvePaidPlan('live', 'price_dynamic_custom', 'TEAM'), 'TEAM');

  process.env = OLD_ENV;
});

test('resolvePaidPlan: returns null when neither signal is usable', async () => {
  withEnv({ STRIPE_PRICE_PRO: 'price_pro_x' });

  assert.equal(await resolvePaidPlan('live', 'price_unknown', undefined), null);
  assert.equal(await resolvePaidPlan('live', null, 'BASIC'), null);
  assert.equal(await resolvePaidPlan('live', null, 42), null);

  process.env = OLD_ENV;
});
