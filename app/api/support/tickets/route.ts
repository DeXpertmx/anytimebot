import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id || null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tickets = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  return NextResponse.json({ tickets });
}

export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const subject = String(body.subject || '').trim().slice(0, 160);
    const message = String(body.message || '').trim().slice(0, 10000);
    const priority = ['LOW', 'NORMAL', 'HIGH'].includes(body.priority) ? body.priority : 'NORMAL';

    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    }

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        subject,
        priority,
        messages: {
          create: { body: message, authorUserId: userId },
        },
      },
      include: { messages: true },
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error('Support ticket creation failed:', error);
    return NextResponse.json({ error: 'Unable to create support ticket' }, { status: 500 });
  }
}
