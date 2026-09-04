import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PATCH /api/webhooks/[id] - toggle active state
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const body = await request.json().catch(() => ({}));
    if (typeof body.active !== 'boolean') {
      return NextResponse.json({ success: false, error: 'active (boolean) is required' }, { status: 400 });
    }

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });
    }

    const updated = await prisma.webhookEndpoint.update({
      where: { id: params.id },
      data: { active: body.active },
      select: { id: true, active: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating webhook endpoint:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/webhooks/[id] - permanently remove an endpoint and its delivery log
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const existing = await prisma.webhookEndpoint.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });
    }

    await prisma.webhookEndpoint.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting webhook endpoint:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
