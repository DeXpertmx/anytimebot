// Resolve which paid platform plan a Stripe object belongs to.
//
// The authoritative signal is the price ID configured for the active mode: a
// price cannot be forged by the client, unlike metadata. Metadata is only a
// fallback for reseller subscriptions, whose price is dynamic (inline
// `price_data`) and therefore has no official price ID to match.

import { getStripePriceId, type StripeMode } from '@/lib/stripe-mode';
import { isPaidPlanTier, PAID_PLAN_TIERS, type PaidPlanTier } from '@/lib/plans';

/**
 * Returns the paid plan tier for a Stripe object, or null when it cannot be
 * determined. Checks the official price IDs first, then the metadata plan.
 */
export async function resolvePaidPlan(
  mode: StripeMode,
  priceId: string | null | undefined,
  metadataPlan?: unknown,
): Promise<PaidPlanTier | null> {
  if (priceId) {
    for (const plan of PAID_PLAN_TIERS) {
      const configured = await getStripePriceId(mode, plan);
      if (configured && configured === priceId) return plan;
    }
  }

  if (isPaidPlanTier(metadataPlan)) return metadataPlan;
  return null;
}
