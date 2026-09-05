import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OFFICIAL_PRICE_CENTS,
  wholesalePriceCents,
  resolvePublicPriceCents,
  resellerMarginCents,
  extractRefFromUrl,
} from './resellers';

describe('wholesalePriceCents', () => {
  test('applies the negotiated discount to the official price', () => {
    // PRO 19 €, 40% discount -> 11.40 € = 1140 cents
    assert.equal(wholesalePriceCents('PRO', 40), 1140);
    // TEAM 39 €, 25% -> 29.25 € = 2925 cents
    assert.equal(wholesalePriceCents('TEAM', 25), 2925);
    // BASIC 29 €, 0% -> 29 €
    assert.equal(wholesalePriceCents('BASIC', 0), 2900);
  });

  test('clamps discount to 0-100', () => {
    assert.equal(wholesalePriceCents('PRO', -10), OFFICIAL_PRICE_CENTS.PRO);
    assert.equal(wholesalePriceCents('PRO', 101), 0);
    assert.equal(wholesalePriceCents('PRO', 100), 0);
  });
});

describe('resolvePublicPriceCents', () => {
  test('uses the reseller price when configured', () => {
    assert.equal(resolvePublicPriceCents('PRO', { PRO: 2500 }), 2500);
  });

  test('falls back to the official price when not configured', () => {
    assert.equal(resolvePublicPriceCents('PRO', null), OFFICIAL_PRICE_CENTS.PRO);
    assert.equal(resolvePublicPriceCents('PRO', {}), OFFICIAL_PRICE_CENTS.PRO);
    assert.equal(resolvePublicPriceCents('PRO', { TEAM: 5000 }), OFFICIAL_PRICE_CENTS.PRO);
  });

  test('ignores zero/negative reseller prices (falls back to official)', () => {
    assert.equal(resolvePublicPriceCents('PRO', { PRO: 0 }), OFFICIAL_PRICE_CENTS.PRO);
    assert.equal(resolvePublicPriceCents('PRO', { PRO: -5 }), OFFICIAL_PRICE_CENTS.PRO);
  });
});

describe('resellerMarginCents', () => {
  test('margin is public minus wholesale', () => {
    // PRO official 19 €, 40% wholesale 11.40 €, reseller sells at 25 € -> 13.60 € margin
    assert.equal(resellerMarginCents('PRO', 40, 2500), 1360);
  });

  test('never negative when reseller sells at/below wholesale', () => {
    assert.equal(resellerMarginCents('PRO', 40, 1000), 0);
  });
});

describe('extractRefFromUrl', () => {
  test('extracts the ref param', () => {
    assert.equal(extractRefFromUrl(new URLSearchParams('ref=acme')), 'acme');
  });

  test('lowercases and trims', () => {
    assert.equal(extractRefFromUrl(new URLSearchParams('ref=  ACME  ')), 'acme');
  });

  test('returns empty when absent', () => {
    assert.equal(extractRefFromUrl(new URLSearchParams('foo=bar')), '');
    assert.equal(extractRefFromUrl(null), '');
  });
});