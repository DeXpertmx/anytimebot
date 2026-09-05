/**
 * Resellers: partners that resell Anytimebot with their own public pricing.
 *
 * - Anytimebot grants each reseller a negotiated wholesale discount (%).
 * - The reseller sets their own public price per plan (min = wholesale price).
 * - Customers arriving through the reseller's identifier are attributed to
 *   them and only ever see the reseller's prices, never the official ones.
 */

import { prisma } from '@/lib/db';
import type { SubscriptionPlan } from '@prisma/client';

export const RESELLER_REF_COOKIE = 'atb_ref';
export const RESELLER_REF_QUERY = 'ref';

/** Official public prices in cents (single source of truth for resellers). */
export const OFFICIAL_PRICE_CENTS: Record<SubscriptionPlan, number> = {
  FREE: 0,
  BASIC: 2900, // 29 € one-time
  PRO: 1900, // 19 €/month
  TEAM: 3900, // 39 €/month
  ENTERPRISE: 0, // custom pricing
};

export const PAID_PLANS: SubscriptionPlan[] = ['BASIC', 'PRO', 'TEAM'];

export interface ResellerContext {
  id: string;
  slug: string;
  name: string;
  discountPercent: number;
}

/** Wholesale price (what the reseller pays Anytimebot) for a plan. */
export function wholesalePriceCents(plan: SubscriptionPlan, discountPercent: number): number {
  const official = OFFICIAL_PRICE_CENTS[plan] ?? 0;
  const discount = Math.min(Math.max(discountPercent || 0, 0), 100);
  return Math.round((official * (100 - discount)) / 100);
}

/** Resolve the price a customer sees: the reseller's public price if set, otherwise the official one. */
export function resolvePublicPriceCents(
  plan: SubscriptionPlan,
  resellerPrices: Partial<Record<SubscriptionPlan, number>> | null | undefined,
): number {
  const resellerPrice = resellerPrices?.[plan];
  if (typeof resellerPrice === 'number' && resellerPrice > 0) return resellerPrice;
  return OFFICIAL_PRICE_CENTS[plan] ?? 0;
}

/** Margin the reseller keeps per sale: public price minus wholesale price. */
export function resellerMarginCents(plan: SubscriptionPlan, discountPercent: number, publicPriceCents: number): number {
  return Math.max(publicPriceCents - wholesalePriceCents(plan, discountPercent), 0);
}

/** Load a reseller by slug (used for ?ref= attribution and /r/{slug} links). */
export async function getResellerBySlug(slug: string): Promise<ResellerContext | null> {
  if (!slug) return null;
  const reseller = await prisma.reseller.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, discountPercent: true, isActive: true },
  });
  if (!reseller || !reseller.isActive) return null;
  return {
    id: reseller.id,
    slug: reseller.slug,
    name: reseller.name,
    discountPercent: reseller.discountPercent,
  };
}

/** Load the reseller's configured public prices (plan -> cents). */
export async function getResellerPlanPrices(resellerId: string): Promise<Partial<Record<SubscriptionPlan, number>>> {
  const rows = await prisma.resellerPlanPrice.findMany({
    where: { resellerId },
    select: { plan: true, priceCents: true },
  });
  const result: Partial<Record<SubscriptionPlan, number>> = {};
  for (const row of rows) {
    result[row.plan] = row.priceCents;
  }
  return result;
}

/** Extract a reseller ref from a URL search param (`?ref=acme`). */
export function extractRefFromUrl(searchParams: URLSearchParams | null): string {
  if (!searchParams) return '';
  const raw = searchParams.get(RESELLER_REF_QUERY) || '';
  return raw.trim().toLowerCase().slice(0, 64);
}