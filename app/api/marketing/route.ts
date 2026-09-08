import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isEmailConfigured } from '@/lib/email-config';
import { getTwilioConfig } from '@/lib/twilio-whatsapp';

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

    // Delivery-channel readiness, so the UI can warn before a send fails.
    // WhatsApp marketing is Twilio-only (Evolution API is never used for
    // campaigns — bulk sends from it can get the tenant's number blocked).
    const [emailConfigured, twilio] = await Promise.all([
      isEmailConfigured().catch(() => false),
      getTwilioConfig(userId).catch(() => ({ configured: false })),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        coupons,
        campaigns,
        tags,
        emailConfigured,
        whatsappConnected: Boolean(twilio.configured),
      },
    });
  } catch (error) {
    console.error('Error loading marketing data:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
