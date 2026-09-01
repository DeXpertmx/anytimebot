// Stripe Connect — tenants connect their own Stripe account (Express) so the
// payments for their booking pages go directly to their bank account. The
// platform does not take a transaction fee; tenants keep 100% of what they
// charge (minus Stripe's own processing fees). Dependencies (prisma, stripe
// client, mode reader) are injectable for testability.

import type { Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode, type StripeMode } from '@/lib/stripe-mode';

export type StripeConnectStatus = 'never' | 'pending' | 'connected' | 'rejected';

export interface StripeConnectDeps<TStripe = any> {
  prisma?: typeof defaultPrisma;
  /** Injectable Stripe-like client (test doubles). Defaults to getStripe(mode). */
  getStripeImpl?: (mode: StripeMode) => Promise<TStripe>;
  /** Injectable mode reader. Defaults to getStripeMode(). */
  getModeImpl?: () => Promise<StripeMode>;
}

function resolveDeps(deps?: StripeConnectDeps) {
  return {
    prisma: deps?.prisma ?? defaultPrisma,
    getStripeImpl: deps?.getStripeImpl ?? (getStripe as any),
    getModeImpl: deps?.getModeImpl ?? getStripeMode,
  };
}

/**
 * Create a Stripe Express account for the tenant (idempotent) and return the
 * connected account id. The account is created in "pending" onboarding status;
 * the tenant must complete Stripe's KYC flow via the generated onboarding link.
 */
export async function ensureStripeConnectAccount<TStripe = any>(
  tenant: { id: string; email: string; name?: string | null; country?: string; currency?: string },
  deps?: StripeConnectDeps<TStripe>,
): Promise<{ accountId: string; status: StripeConnectStatus }> {
  const { prisma, getStripeImpl, getModeImpl } = resolveDeps(deps);

  const user = await prisma.user.findUnique({ where: { id: tenant.id } });
  if (!user) throw new Error('Tenant not found');

  // Already connected: re-use the account id (onboarding can be resumed).
  if (user.stripeAccountId) {
    return { accountId: user.stripeAccountId, status: (user.stripeAccountStatus as StripeConnectStatus) || 'pending' };
  }

  const mode = await getModeImpl();
  const stripe = await getStripeImpl(mode);

  // Stripe Connect Express requires the account's country and business type.
  const country = (tenant.country || 'ES').toUpperCase();
  const account = await stripe.accounts.create({
    type: 'express',
    country,
    email: tenant.email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: 'individual',
    business_profile: {
      name: tenant.name || tenant.email.split('@')[0] || 'Anytimebot business',
      product_description: 'Booking & appointment payments via Anytimebot',
    },
    metadata: {
      anytimebotUserId: tenant.id,
      anytimebotTenant: tenant.email,
    },
  });

  await prisma.user.update({
    where: { id: tenant.id },
    data: {
      stripeAccountId: account.id,
      stripeAccountStatus: 'pending',
    },
  });

  return { accountId: account.id, status: 'pending' };
}

/**
 * Create a Stripe Account Link for the tenant's Express onboarding.
 * The returned URL is where the tenant completes KYC at Stripe.
 */
export async function createStripeConnectOnboardingLink<TStripe = any>(
  tenantId: string,
  origin: string,
  deps?: StripeConnectDeps<TStripe>,
): Promise<string> {
  const { prisma, getStripeImpl, getModeImpl } = resolveDeps(deps);
  const user = await prisma.user.findUnique({ where: { id: tenantId } });
  if (!user) throw new Error('Tenant not found');
  if (!user.stripeAccountId) throw new Error('No Stripe account yet');

  const mode = await getModeImpl();
  const stripe = await getStripeImpl(mode);

  const base = (origin || process.env.NEXT_PUBLIC_APP_URL || 'https://anytimebot.app').replace(/\/$/, '');
  const link = await stripe.accountLinks.create({
    account: user.stripeAccountId,
    refresh_url: `${base}/dashboard/settings?stripe=refresh`,
    return_url: `${base}/dashboard/settings?stripe=return`,
    type: 'account_onboarding',
  });

  return link.url;
}

/**
 * Refresh the tenant's Connect status from Stripe and persist it.
 * Returns the up-to-date status object.
 */
export async function refreshStripeConnectStatus<TStripe = any>(
  tenantId: string,
  deps?: StripeConnectDeps<TStripe>,
): Promise<{
  accountId: string | null;
  status: StripeConnectStatus;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
}> {
  const { prisma, getStripeImpl, getModeImpl } = resolveDeps(deps);
  const user = await prisma.user.findUnique({ where: { id: tenantId } });
  if (!user || !user.stripeAccountId) {
    return { accountId: null, status: 'never', detailsSubmitted: false, chargesEnabled: false };
  }

  try {
    const mode = await getModeImpl();
    const stripe = await getStripeImpl(mode);
    const account = await stripe.accounts.retrieve(user.stripeAccountId);

    const detailsSubmitted = account.details_submitted === true;
    const chargesEnabled = account.charges_enabled === true;

    let status: StripeConnectStatus;
    if (chargesEnabled) {
      status = 'connected';
    } else if (account.requirements?.disabled_reason || account.requirements?.past_due?.length) {
      status = 'rejected';
    } else {
      status = 'pending';
    }

    if (status !== (user.stripeAccountStatus as StripeConnectStatus)) {
      await prisma.user.update({
        where: { id: tenantId },
        data: { stripeAccountStatus: status },
      });
    }

    return { accountId: user.stripeAccountId, status, detailsSubmitted, chargesEnabled };
  } catch (error) {
    console.error('Failed to refresh Stripe Connect status:', error);
    return {
      accountId: user.stripeAccountId,
      status: 'pending',
      detailsSubmitted: false,
      chargesEnabled: false,
    };
  }
}

/** Convenience: get the tenant's connected account id if it can accept payments. */
export async function getTenantStripeAccountId<TStripe = any>(
  tenantId: string,
  deps?: StripeConnectDeps<TStripe>,
): Promise<string | null> {
  const { prisma } = resolveDeps(deps);
  const user = await prisma.user.findUnique({
    where: { id: tenantId },
    select: { stripeAccountId: true, stripeAccountStatus: true },
  });
  if (!user?.stripeAccountId || user.stripeAccountStatus !== 'connected') return null;
  return user.stripeAccountId;
}