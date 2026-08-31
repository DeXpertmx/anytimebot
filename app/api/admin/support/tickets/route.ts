import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    const tickets = await prisma.supportTicket.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    return NextResponse.json({ tickets });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: error.message?.includes('Unauthorized') ? 403 : 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const id = String(body.id || '');
    const status = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(body.status) ? body.status : null;
    const priority = ['LOW', 'NORMAL', 'HIGH'].includes(body.priority) ? body.priority : null;
    if (!id || (!status && !priority)) return NextResponse.json({ error: 'Invalid update' }, { status: 400 });

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: {
        ...(status ? { status, closedAt: status === 'CLOSED' ? new Date() : null } : {}),
        ...(priority ? { priority } : {}),
      },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return NextResponse.json({ ticket });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unable to update ticket' }, { status: error.message?.includes('Unauthorized') ? 403 : 500 });
  }
}
