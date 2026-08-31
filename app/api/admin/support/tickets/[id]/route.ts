import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminUser } from '@/lib/admin';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const admin = await getAdminUser();
    const body = String((await request.json()).body || '').trim().slice(0, 10000);
    if (!admin || !body) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    const ticket = await prisma.supportTicket.findUnique({ where: { id: params.id } });
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    if (ticket.status === 'CLOSED') return NextResponse.json({ error: 'Ticket is closed' }, { status: 409 });

    await prisma.supportTicketMessage.create({
      data: { ticketId: ticket.id, body, authorAdminEmail: admin.email },
    });
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'IN_PROGRESS' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return NextResponse.json({ ticket: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unable to reply to ticket' }, { status: error.message?.includes('Unauthorized') ? 403 : 500 });
  }
}
