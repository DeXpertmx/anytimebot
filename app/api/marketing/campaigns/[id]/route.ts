import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeCouponCode, type CampaignAudience } from '@/lib/marketing';

export const dynamic = 'force-dynamic';

async function findOwned(id: string, userId: string) {
  return prisma.campaign.findFirst({
    where: { id, userId },
    include: { _count: { select: { recipients: true } } },
  });
}

// GET /api/marketing/campaigns/[id]
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const campaign = await findOwned(params.id, userId);
    if (!campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/marketing/campaigns/[id] — edit only while still a draft.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const existing = await findOwned(params.id, userId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }
    if (existing.status !== 'DRAFT') {
      return NextResponse.json(
        { success: false, error: 'Only draft campaigns can be edited' },
        { status: 409 },
      );
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = (body.name as string)?.trim();
      if (!name) return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
      data.name = name;
    }
    if (body.subject !== undefined) {
      const subject = (body.subject as string)?.trim();
      if (!subject) return NextResponse.json({ success: false, error: 'Subject is required' }, { status: 400 });
      data.subject = subject;
    }
    if (body.htmlBody !== undefined) {
      if (!body.htmlBody) return NextResponse.json({ success: false, error: 'Body is required' }, { status: 400 });
      data.htmlBody = body.htmlBody;
    }
    if (body.channel !== undefined) {
      // PATCH already rejects non-draft campaigns; just normalize the value.
      data.channel = body.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL';
    }
    if (body.audience !== undefined) {
      const raw = body.audience as Record<string, unknown>;
      const mode = raw?.mode === 'tags' ? 'tags' : 'all';
      const tags = Array.isArray(raw?.tags)
        ? (raw.tags as unknown[]).filter((t): t is string => typeof t === 'string')
        : [];
      data.audience = { mode, tags } as CampaignAudience;
    }
    if (body.couponCode !== undefined) {
      data.couponCode = body.couponCode ? normalizeCouponCode(body.couponCode) : null;
    }

    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data,
    });
    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error updating campaign:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/marketing/campaigns/[id]
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const existing = await prisma.campaign.findFirst({ where: { id: params.id, userId } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }
    await prisma.campaign.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
