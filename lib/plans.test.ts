import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_CONFIG,
  PAID_PLAN_TIERS,
  FOUNDER_SEATS,
  canClaimFounderSeat,
  isPaidPlanTier,
} from './plans';

describe('plan catalog', () => {
  test('Founder is priced at 9 €/mo and inherits Pro-level quotas', () => {
    assert.equal(PLAN_CONFIG.FOUNDER.price, 9);
    assert.deepEqual(PLAN_CONFIG.FOUNDER.quotas, PLAN_CONFIG.PRO.quotas);
  });

  test('Enterprise is priced at 79 €/mo', () => {
    assert.equal(PLAN_CONFIG.ENTERPRISE.price, 79);
  });

  test('Pro and Team keep their anchor prices', () => {
    assert.equal(PLAN_CONFIG.PRO.price, 19);
    assert.equal(PLAN_CONFIG.TEAM.price, 39);
  });

  test('the sold catalog excludes the legacy BASIC plan', () => {
    assert.deepEqual([...PAID_PLAN_TIERS], ['FOUNDER', 'PRO', 'TEAM', 'ENTERPRISE']);
    assert.equal(isPaidPlanTier('BASIC'), false);
    assert.equal(isPaidPlanTier('FOUNDER'), true);
    assert.equal(isPaidPlanTier('nope'), false);
    assert.equal(isPaidPlanTier(undefined), false);
  });
});

describe('founder seats', () => {
  test('allows seats while under the cap', () => {
    assert.equal(FOUNDER_SEATS, 20);
    assert.equal(canClaimFounderSeat(0), true);
    assert.equal(canClaimFounderSeat(19), true);
  });

  test('refuses a seat once the cap is reached', () => {
    assert.equal(canClaimFounderSeat(20), false);
    assert.equal(canClaimFounderSeat(21), false);
  });

  test('treats a negative count as no seats taken', () => {
    assert.equal(canClaimFounderSeat(-3), true);
  });
});
