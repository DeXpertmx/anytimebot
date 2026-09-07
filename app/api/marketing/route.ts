import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/marketing — everything the Marketing dashboard needs: coupons,
// campaigns (with aggregated counters) and the distinct CRM tags available to
// build segments.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const [coupons, campaigns, customers] = await Promise.all([
      prisma.coupon.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.campaign.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { recipients: true } } },
      }),
      prisma.customer.findMany({
        where: { userId },
        select: { tags: true },
      }),
    ]);

    const tagSet = new Set<string>();
    for (const customer of customers) {
      for (const tag of customer.tags || []) {
        if (tag) tagSet.add(tag);
      }
    }
    const tags = [...tagSet].sort((a, b) => a.localeCompare(b));

    return NextResponse.json({ success: true, data: { coupons, campaigns, tags } });
  } catch (error) {
    console.error('Error loading marketing data:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
