import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  ensureStripeConnectAccount,
  createStripeConnectOnboardingLink,
} from '@/lib/stripe-connect';

export const dynamic = 'force-dynamic';

/**
 * POST /api/stripe/connect/onboarding
 * Creates (or re-uses) the tenant's Stripe Connect Express account and returns
 * the onboarding URL where the tenant completes their KYC at Stripe.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const userId = (session.user as any).id as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 },
      );
    }

    const { accountId, status } = await ensureStripeConnectAccount({
      id: user.id,
      email: user.email,
      name: user.name,
      country: user.country,
      currency: user.currency,
    });

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://anytimebot.app';
    const url = await createStripeConnectOnboardingLink(userId, origin);

    return NextResponse.json({
      success: true,
      data: { accountId, status, url },
    });
  } catch (error: any) {
    console.error('Error creating Stripe Connect onboarding:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}