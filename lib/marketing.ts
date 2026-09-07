import crypto from 'crypto';
import { prisma } from '@/lib/db';

/**
 * Marketing automation helpers: coupon math & validation, CRM segment
 * resolution for email campaigns and signed unsubscribe tokens.
 *
 * Pure helpers (computeCouponDiscount, couponUsable, segmentCustomers,
 * normalizeCouponCode, sign/verifyMarketingToken) are dependency-free so they
 * are unit-tested directly; db-touching helpers accept an injectable client
 * (same DI pattern as lib/webhooks.ts).
 */

export interface MarketingDeps {
  prisma?: typeof prisma;
}

export function resolveDeps(deps?: MarketingDeps) {
  return { db: deps?.prisma ?? prisma };
}

export interface CouponLike {
  id: string;
  userId: string;
  code: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  maxRedemptions: number;
  redemptions: number;
  isActive: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
}

/** Audience rule of a campaign. */
export interface CampaignAudience {
  mode: 'all' | 'tags';
  tags?: string[];
}

/** Normalize a user-typed coupon code to its stored form (VERANO10). */
export function normalizeCouponCode(raw: string | null | undefined): string {
  return (raw || '').trim().toUpperCase();
}

/**
 * Discount (in cents) a coupon grants over a gross total. Percentage coupons
 * round down; fixed coupons never exceed the total.
 */
export function computeCouponDiscount(
  coupon: Pick<CouponLike, 'discountType' | 'discountValue'>,
  totalCents: number,
): number {
  if (totalCents <= 0) return 0;
  if (coupon.discountType === 'FIXED') {
    return Math.min(coupon.discountValue, totalCents);
  }
  return Math.floor((totalCents * coupon.discountValue) / 100);
}

export type CouponError =
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'NOT_STARTED'
  | 'EXPIRED'
  | 'LIMIT_REACHED';

/** Why a coupon cannot be used right now (null = redeemable). */
export function couponUsable(
  coupon: CouponLike,
  now: Date = new Date(),
): CouponError | null {
  if (!coupon.isActive) return 'INACTIVE';
  if (coupon.startsAt && coupon.startsAt > now) return 'NOT_STARTED';
  if (coupon.expiresAt && coupon.expiresAt <= now) return 'EXPIRED';
  if (coupon.maxRedemptions > 0 && coupon.redemptions >= coupon.maxRedemptions) {
    return 'LIMIT_REACHED';
  }
  return null;
}

/**
 * Resolve a redeemable coupon for a tenant by code (normalized). Returns the
 * coupon plus the reason when it exists but is not usable.
 */
export async function findRedeemableCoupon(
  userId: string,
  code: string,
  deps?: MarketingDeps,
  now: Date = new Date(),
): Promise<{ coupon: CouponLike | null; error?: CouponError | 'NOT_FOUND' }> {
  const { db } = resolveDeps(deps);
  const normalized = normalizeCouponCode(code);
  if (!normalized) return { coupon: null, error: 'NOT_FOUND' };
  const coupon = (await db.coupon.findFirst({
    where: { userId, code: normalized },
  })) as CouponLike | null;
  if (!coupon) return { coupon: null, error: 'NOT_FOUND' };
  const error = couponUsable(coupon, now);
  return { coupon, error: error ?? undefined };
}

export interface CustomerLike {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  tags?: string[];
  marketingOptOut?: boolean;
}

/** Pure segment filter over a customer list (used by the campaign send). */
export function segmentCustomers(
  customers: CustomerLike[],
  audience: CampaignAudience,
): CustomerLike[] {
  const mode = audience?.mode === 'tags' ? 'tags' : 'all';
  const tags = (audience?.tags || []).map((t) => t.trim()).filter(Boolean);
  const optedOut = new Set(
    customers.filter((c) => c.marketingOptOut).map((c) => c.email.toLowerCase()),
  );
  const visible = customers.filter((c) => !optedOut.has(c.email.toLowerCase()));

  if (mode === 'all') return visible;
  if (tags.length === 0) return [];
  return visible.filter((c) => (c.tags || []).some((t) => tags.includes(t)));
}

/** Deduplicate by lowercased email keeping order. */
export function dedupeByEmail<T extends { email: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * All customers of the user that the campaign audience selects (excluding
 * opted-out contacts, already handled by segmentCustomers).
 */
export async function resolveAudienceCustomers(
  userId: string,
  audience: CampaignAudience,
  deps?: MarketingDeps,
): Promise<CustomerLike[]> {
  const { db } = resolveDeps(deps);
  const customers = (await db.customer.findMany({
    where: { userId },
    select: { id: true, email: true, name: true, phone: true, tags: true, marketingOptOut: true },
  })) as CustomerLike[];
  return dedupeByEmail(segmentCustomers(customers, audience));
}

/**
 * Recipients reachable by WhatsApp: audience customers that actually have a
 * phone number. WhatsApp campaigns must never fall back to email silently —
 * contacts without a phone are simply not addressed (the send route reports
 * the skipped count so the owner can complete their CRM data).
 */
export function selectWhatsAppRecipients(customers: CustomerLike[]): CustomerLike[] {
  return customers.filter((c) => (c.phone || '').replace(/[^0-9]/g, '').length >= 8);
}

/** Personalized email subject/body ({{nombre}}, {{email}}, {{codigo}}). */
export function renderCampaignContent(
  template: string,
  vars: Record<string, string>,
): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

export function couponDisplay(coupon: Pick<CouponLike, 'discountType' | 'discountValue'>): string {
  return coupon.discountType === 'PERCENTAGE'
    ? `${coupon.discountValue}%`
    : `${(coupon.discountValue / 100).toFixed(2)}€`;
}

// ---------------------------------------------------------------------------
// Unsubscribe tokens (signed with a stable secret so links survive redeploys).
// ---------------------------------------------------------------------------

function marketingSecret(): string {
  return (
    process.env.MARKETING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'anytimebot-marketing-dev'
  );
}

/** base64url(json payload) + '.' + hmac signature */
export function signMarketingToken(userId: string, email: string): string {
  const payload = Buffer.from(JSON.stringify({ userId, email })).toString('base64url');
  const sig = crypto.createHmac('sha256', marketingSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyMarketingToken(
  token: string,
): { userId: string; email: string } | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', marketingSecret()).update(payload).digest('hex');
    if (sig.length !== expected.length) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff !== 0) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed?.userId !== 'string' || typeof parsed?.email !== 'string') return null;
    return { userId: parsed.userId, email: parsed.email };
  } catch {
    return null;
  }
}
