import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { refreshStripeConnectStatus } from '@/lib/stripe-connect';

export const dynamic = 'force-dynamic';

/**
 * GET /api/stripe/connect/status
 * Returns the tenant's Stripe Connect status (refreshed from Stripe).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const userId = (session.user as any).id as string;
    const status = await refreshStripeConnectStatus(userId);

    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    console.error('Error fetching Stripe Connect status:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}