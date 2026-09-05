
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { PricingContent, type ResellerPricing } from '@/components/pricing/pricing-content';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getResellerBySlug, getResellerPlanPrices, extractRefFromUrl, RESELLER_REF_COOKIE, resolvePublicPriceCents, type ResellerContext } from '@/lib/resellers';

export const metadata: Metadata = {
  title: 'Planes y precios - Anytimebot',
  description: 'Planes sencillos para recibir reservas, automatizar tu agenda y atender a tus clientes por WhatsApp.',
  openGraph: {
    title: 'Planes y precios - Anytimebot',
    description: 'Elige el plan que mejor se adapta a tu negocio.',
  },
};

interface PricingPageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

/**
 * Resolve the pricing context:
 * 1. A logged-in user attributed to a reseller uses that reseller's prices.
 * 2. Otherwise the ?ref= cookie/param points at a reseller (attribution).
 * 3. Otherwise official prices.
 */
async function resolveResellerContext(searchParams?: { [key: string]: string | string[] | undefined }): Promise<{
  reseller: ResellerContext | null;
  prices: Partial<Record<'BASIC' | 'PRO' | 'TEAM', number>>;
}> {
  const cookieStore = cookies();

  // 1. Logged-in user's reseller (persistent attribution).
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { resellerId: true },
    });
    if (user?.resellerId) {
      const reseller = await prisma.reseller.findUnique({
        where: { id: user.resellerId },
        select: { id: true, slug: true, name: true, discountPercent: true, isActive: true },
      });
      if (reseller?.isActive) {
        const ctx: ResellerContext = {
          id: reseller.id,
          slug: reseller.slug,
          name: reseller.name,
          discountPercent: reseller.discountPercent,
        };
        const prices = await getResellerPlanPrices(ctx.id);
        return { reseller: ctx, prices };
      }
    }
  }

  // 2. Cookie/param ref attribution.
  let ref = '';
  const cookieRef = cookieStore.get(RESELLER_REF_COOKIE)?.value || '';
  const paramRef = extractRefFromUrl(
    searchParams ? new URLSearchParams(
      Object.entries(searchParams).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v as string]])),
    ) : null,
  );
  ref = paramRef || cookieRef;

  if (ref) {
    const reseller = await getResellerBySlug(ref);
    if (reseller) {
      const prices = await getResellerPlanPrices(reseller.id);
      return { reseller, prices };
    }
  }

  return { reseller: null, prices: {} };
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const session = await getServerSession(authOptions);
  
  let currentPlan = 'FREE';
  let hasActiveSubscription = false;
  
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, subscriptionStatus: true },
    });
    
    if (user) {
      currentPlan = user.plan;
      hasActiveSubscription = user.subscriptionStatus === 'ACTIVE';
    }
  }

  const { reseller, prices } = await resolveResellerContext(searchParams);

  // Build per-plan public prices (euros) for the client component.
  const resellerPricing: ResellerPricing | null = reseller
    ? {
        resellerName: reseller.name,
        prices: {
          basic: resolvePublicPriceCents('BASIC', prices) / 100,
          pro: resolvePublicPriceCents('PRO', prices) / 100,
          team: resolvePublicPriceCents('TEAM', prices) / 100,
        },
      }
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src="/anytimebot-logo.png" 
                alt="ANYTIMEBOT Logo" 
                width={200}
                height={60}
                className="h-[60px] w-[200px] object-contain"
              />
            </div>
            {session ? (
              <a
                href="/dashboard"
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Ir al panel
              </a>
            ) : (
              <div className="flex gap-3">
                <a
                  href="/auth/signin"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Sign In
                </a>
                <a
                  href="/auth/signup"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Sign Up
                </a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pricing Content */}
      <PricingContent 
        currentPlan={currentPlan} 
        hasActiveSubscription={hasActiveSubscription}
        isLoggedIn={!!session}
        resellerPricing={resellerPricing}
      />
    </div>
  );
}
