export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

/**
 * Retired legacy checkout endpoint.
 *
 * This route used to create a live Stripe subscription for the old
 * "ANYTIMEBOT Premium" plan at 29 USD/month with no `plan` in the Checkout
 * metadata. With the current catalog the price is unknown to
 * `resolvePaidPlan()`, so the subscription webhooks fell back to PRO: anyone
 * reaching this URL would have been charged 29 USD/month for Pro, bypassing the
 * Coach Fundador offer, its 20-seat limit and the EUR price list.
 *
 * Nothing in the app calls it any more (the pricing page and the upgrade modal
 * use `/api/stripe/create-checkout-session`), but a stale client still can, so
 * the route answers 410 Gone instead of selling a plan that no longer exists.
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        'This checkout endpoint has been retired. Use /api/stripe/create-checkout-session with one of the current plans (FOUNDER, PRO, TEAM, ENTERPRISE).',
      plansUrl: '/pricing',
    },
    { status: 410 }
  );
}
