import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode } from '@/lib/stripe-mode';

export const dynamic = 'force-dynamic';

// GET /api/memberships — list the tenant's client subscription records
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const memberships = await prisma.memberSubscription.findMany({
      where: { userId },
      include: { eventType: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: memberships });
  } catch (error) {
    console.error('Error listing memberships:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}