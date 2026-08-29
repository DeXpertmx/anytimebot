export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma as db } from '@/lib/db';
import { publishBotMessage } from '@/lib/convex-server';
import { generateBotResponse } from '@/lib/bot-response';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const username = typeof body.username === 'string' ? body.username.trim() : '';

    if (!message || !username) {
      return NextResponse.json({ error: 'Message and username are required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { username },
      include: {
        bots: {
          where: { isActive: true },
          include: { documents: true },
          take: 1,
        },
        bookingPages: {
          where: { isActive: true },
          take: 1,
        },
      },
    });

    const bot = user?.bots[0];
    if (!user || !bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const phone = `web:${username}`;
    await publishBotMessage({
      externalBotId: bot.id,
      externalUserId: user.id,
      phone,
      role: 'user',
      content: message,
    });

    const responseText = await generateBotResponse({
      bot,
      ownerName: user.name,
      username,
      message,
      bookingPages: user.bookingPages,
      channel: 'web',
    });

    await publishBotMessage({
      externalBotId: bot.id,
      externalUserId: user.id,
      phone,
      role: 'assistant',
      content: responseText,
    });

    return new Response(responseText, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error in chat:', error);
    return NextResponse.json({ error: 'Failed to process chat' }, { status: 500 });
  }
}
