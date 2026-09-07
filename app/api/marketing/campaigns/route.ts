import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeCouponCode, type CampaignAudience } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

function parseAudience(raw: unknown): CampaignAudience | null {
  if (!raw || typeof raw !== 'object') return null;
  const audience = raw as Record<string, unknown>;
  const mode = audience.mode === 'tags' ? 'tags' : 'all';
  const tags = Array.isArray(audience.tags)
    ? (audience.tags as unknown[]).filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
    : [];
  return { mode, tags };
}

// POST /api/marketing/campaigns — create a campaign (starts as DRAFT).
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const body = await request.json();
    const name = (body.name as string)?.trim();
    const subject = (body.subject as string)?.trim();
    const htmlBody = body.htmlBody as string;

    if (!name || !subject || !htmlBody) {
      return NextResponse.json(
        { success: false, error: 'Name, subject and body are required' },
        { status: 400 },
      );
    }
    const audience = parseAudience(body.audience);
    if (!audience) {
      return NextResponse.json({ success: false, error: 'Invalid audience' }, { status: 400 });
    }

    const campaign = await prisma.campaign.create({
      data: {
        userId,
        name,
        subject,
        htmlBody,
        audience: audience as any,
        couponCode: body.couponCode ? normalizeCouponCode(body.couponCode) : null,
        status: 'DRAFT',
      },
    });

    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error creating campaign:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
