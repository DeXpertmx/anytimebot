/**
 * Tests for lib/marketing.ts (node:test + tsx). Pure helpers are tested
 * directly; db-touching helpers use a fake prisma (DI pattern).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeCouponCode,
  computeCouponDiscount,
  couponUsable,
  findRedeemableCoupon,
  segmentCustomers,
  resolveAudienceCustomers,
  renderCampaignContent,
  couponDisplay,
  signMarketingToken,
  verifyMarketingToken,
  type CouponLike,
} from './marketing';

const baseCoupon = (over: Partial<CouponLike> = {}): CouponLike => ({
  id: 'c1',
  userId: 'u1',
  code: 'VERANO10',
  discountType: 'PERCENTAGE',
  discountValue: 10,
  maxRedemptions: 0,
  redemptions: 0,
  isActive: true,
  startsAt: null,
  expiresAt: null,
  ...over,
});

// ---------------------------------------------------------------------------
// Code normalization + discount math
// ---------------------------------------------------------------------------

test('normalizeCouponCode uppercases and trims', () => {
  assert.equal(normalizeCouponCode('  verano10  '), 'VERANO10');
  assert.equal(normalizeCouponCode(''), '');
  assert.equal(normalizeCouponCode(null), '');
});

test('percentage coupon rounds the discount down', () => {
  const c = baseCoupon({ discountType: 'PERCENTAGE', discountValue: 10 });
  assert.equal(computeCouponDiscount(c, 2500), 250);
  assert.equal(computeCouponDiscount(c, 999), 99);
  assert.equal(computeCouponDiscount(c, 0), 0);
});

test('fixed coupon never exceeds the total', () => {
  const c = baseCoupon({ discountType: 'FIXED', discountValue: 500 });
  assert.equal(computeCouponDiscount(c, 2500), 500);
  assert.equal(computeCouponDiscount(c, 300), 300); // clamped
});

test('couponUsable checks active, dates and redemption limit', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  assert.equal(couponUsable(baseCoupon(), now), null);
  assert.equal(couponUsable(baseCoupon({ isActive: false }), now), 'INACTIVE');
  assert.equal(
    couponUsable(baseCoupon({ startsAt: new Date('2026-09-02T00:00:00Z') }), now),
    'NOT_STARTED',
  );
  assert.equal(
    couponUsable(baseCoupon({ expiresAt: new Date('2026-08-31T00:00:00Z') }), now),
    'EXPIRED',
  );
  assert.equal(
    couponUsable(baseCoupon({ maxRedemptions: 5, redemptions: 5 }), now),
    'LIMIT_REACHED',
  );
  assert.equal(
    couponUsable(baseCoupon({ maxRedemptions: 5, redemptions: 4 }), now),
    null,
  );
});

// ---------------------------------------------------------------------------
// Segment resolution
// ---------------------------------------------------------------------------

const customers = [
  { id: 'c1', email: 'a@x.com', name: 'Ana', tags: ['vip'], marketingOptOut: false },
  { id: 'c2', email: 'b@x.com', name: 'Bruno', tags: ['nuevo'], marketingOptOut: false },
  { id: 'c3', email: 'c@x.com', name: 'Carla', tags: ['vip', 'recurrente'], marketingOptOut: false },
  { id: 'c4', email: 'd@x.com', name: 'Dani', tags: [], marketingOptOut: true },
];

test('segmentCustomers: all mode includes everyone except opted-out', () => {
  const res = segmentCustomers(customers, { mode: 'all' });
  assert.deepEqual(res.map((c) => c.email), ['a@x.com', 'b@x.com', 'c@x.com']);
});

test('segmentCustomers: tags mode keeps customers carrying any selected tag', () => {
  const res = segmentCustomers(customers, { mode: 'tags', tags: ['vip'] });
  assert.deepEqual(res.map((c) => c.email), ['a@x.com', 'c@x.com']);
  const empty = segmentCustomers(customers, { mode: 'tags', tags: [] });
  assert.deepEqual(empty, []);
});

test('resolveAudienceCustomers queries by user and dedupes emails', async () => {
  const db: any = {
    customer: {
      findMany: async ({ where }: any) => {
        assert.equal(where.userId, 'u1');
        return [
          { id: '1', email: 'A@X.com', name: 'Ana', tags: ['vip'], marketingOptOut: false },
          { id: '2', email: 'a@x.com', name: 'Ana dup', tags: ['vip'], marketingOptOut: false },
          { id: '3', email: 'out@x.com', name: 'Out', tags: [], marketingOptOut: true },
        ];
      },
    },
  };
  const res = await resolveAudienceCustomers('u1', { mode: 'all' }, { prisma: db as any });
  assert.deepEqual(res.map((c) => c.email), ['A@X.com']);
});

test('findRedeemableCoupon returns the coupon and why it is unusable', async () => {
  const db: any = {
    coupon: {
      findFirst: async ({ where }: any) => {
        if (where.code !== 'LIMIT10') return null;
        return baseCoupon({ id: 'x', code: 'LIMIT10', maxRedemptions: 2, redemptions: 2 });
      },
    },
  };
  const { coupon, error } = await findRedeemableCoupon('u1', '  limit10 ', { prisma: db as any });
  assert.equal(coupon?.id, 'x');
  assert.equal(error, 'LIMIT_REACHED');

  const miss = await findRedeemableCoupon('u1', 'nope', { prisma: db as any });
  assert.equal(miss.coupon, null);
  assert.equal(miss.error, 'NOT_FOUND');
});

// ---------------------------------------------------------------------------
// Rendering + display + tokens
// ---------------------------------------------------------------------------

test('renderCampaignContent replaces personalization placeholders', () => {
  const html = 'Hola {{nombre}}, tu código es {{codigo}}';
  assert.equal(
    renderCampaignContent(html, { nombre: 'Ana', codigo: 'VERANO10' }),
    'Hola Ana, tu código es VERANO10',
  );
});

test('couponDisplay formats percentages and fixed amounts', () => {
  assert.equal(couponDisplay({ discountType: 'PERCENTAGE', discountValue: 15 }), '15%');
  assert.equal(couponDisplay({ discountType: 'FIXED', discountValue: 500 }), '5.00€');
});

test('unsubscribe tokens sign and verify (and reject tampering)', () => {
  const token = signMarketingToken('u1', 'ana@x.com');
  assert.deepEqual(verifyMarketingToken(token), { userId: 'u1', email: 'ana@x.com' });
  assert.equal(verifyMarketingToken('garbage'), null);
  const tampered = `${token.slice(0, -2)}xx`;
  assert.equal(verifyMarketingToken(tampered), null);
});
