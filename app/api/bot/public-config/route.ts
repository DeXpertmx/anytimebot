
import { NextRequest, NextResponse } from 'next/server';
import { prisma as db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Get user and bot
    const user = await db.user.findUnique({
      where: { username },
      include: {
        bots: {
          select: {
            name: true,
            avatar: true,
            greeting: true,
          },
          take: 1,
        },
      },
    });

    if (!user || !user.bots[0]) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const bot = user.bots[0];

    return NextResponse.json({
      name: bot.name || 'MindBot',
      avatar: bot.avatar || '🤖',
      greeting: bot.greeting || "👋 Hi! I'm here to help you schedule meetings. How can I assist you today?",
    });
  } catch (error) {
    console.error('Error fetching bot config:', error);
    return NextResponse.json({ error: 'Failed to fetch bot config' }, { status: 500 });
  }
}
