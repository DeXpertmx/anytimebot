import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode } from '@/lib/stripe-mode';

export const dynamic = 'force-dynamic';

// POST /api/memberships/[id]/cancel — cancel a client subscription on Stripe
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const membership = await prisma.memberSubscription.findFirst({
      where: { id: params.id, userId },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: 'Membership not found' }, { status: 404 });
    }
    if (membership.status === 'CANCELLED') {
      return NextResponse.json({ success: false, error: 'Membership already cancelled' }, { status: 400 });
    }

    const mode = await getStripeMode();
    const stripe = await getStripe(mode);
    const opts = membership.stripeAccountId
      ? { stripeAccount: membership.stripeAccountId }
      : {};

    await stripe.subscriptions.cancel(membership.stripeSubscriptionId, undefined, opts as any);

    const updated = await prisma.memberSubscription.update({
      where: { id: membership.id },
      data: { status: 'CANCELLED' },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error cancelling membership:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}