import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id || null;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ticket = await prisma.supportTicket.findFirst({
    where: { id: params.id, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  return NextResponse.json({ ticket });
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = String((await request.json()).body || '').trim().slice(0, 10000);
    if (!body) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

    const ticket = await prisma.supportTicket.findFirst({ where: { id: params.id, userId } });
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    if (ticket.status === 'CLOSED') return NextResponse.json({ error: 'Ticket is closed' }, { status: 409 });

    await prisma.supportTicketMessage.create({
      data: { ticketId: ticket.id, body, authorUserId: userId },
    });
    const updated = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { status: 'OPEN' },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return NextResponse.json({ ticket: updated });
  } catch (error) {
    console.error('Support ticket reply failed:', error);
    return NextResponse.json({ error: 'Unable to reply to support ticket' }, { status: 500 });
  }
}
