
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        bots: {
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Return existing bot or null
    const bot = user.bots[0] || null;
    return NextResponse.json(bot);
  } catch (error) {
    console.error('Error fetching bot config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bot config' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        bots: {
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { name, avatar, greeting, personality, tone } = await req.json();

    let bot;
    if (user.bots.length > 0) {
      // Update existing bot
      bot = await prisma.bot.update({
        where: { id: user.bots[0].id },
        data: { name, avatar, greeting, personality, tone },
      });
    } else {
      // Create new bot
      bot = await prisma.bot.create({
        data: {
          userId: user.id,
          name: name || 'MindBot',
          avatar: avatar || 'robot',
          greeting: greeting || '¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?',
          personality,
          tone,
        },
      });
    }

    return NextResponse.json(bot);
  } catch (error) {
    console.error('Error saving bot config:', error);
    return NextResponse.json(
      { error: 'Failed to save bot config' },
      { status: 500 }
    );
  }
}
