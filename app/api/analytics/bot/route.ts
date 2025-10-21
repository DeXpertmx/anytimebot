
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '30'; // days

    const daysAgo = parseInt(range);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);

    // Get bots
    const bots = await prisma.bot.findMany({
      where: { userId: user.id },
    });

    const botIds = bots.map(b => b.id);

    // Get conversations
    const conversations = await prisma.botConversation.findMany({
      where: {
        botId: { in: botIds },
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Conversations by date
    const conversationsByDate = conversations.reduce((acc: any, conv) => {
      const date = conv.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { count: 0, messages: 0 };
      }
      acc[date].count++;
      
      // Count messages in this conversation
      const messages = Array.isArray(conv.messages) ? conv.messages : [];
      acc[date].messages += messages.length;
      
      return acc;
    }, {});

    // Fill in missing dates
    const timeline = [];
    for (let i = daysAgo - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      timeline.push({
        date: dateStr,
        conversations: conversationsByDate[dateStr]?.count || 0,
        messages: conversationsByDate[dateStr]?.messages || 0,
      });
    }

    // Total stats
    const totalConversations = conversations.length;
    const totalMessages = conversations.reduce((sum, conv) => {
      const messages = Array.isArray(conv.messages) ? conv.messages : [];
      return sum + messages.length;
    }, 0);

    const avgMessagesPerConversation = totalConversations > 0
      ? Math.round(totalMessages / totalConversations)
      : 0;

    // Active conversations (had activity in last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const activeConversations = await prisma.botConversation.count({
      where: {
        botId: { in: botIds },
        lastMessageAt: { gte: sevenDaysAgo },
      },
    });

    // Most active hours
    const messagesByHour = conversations.reduce((acc: any, conv) => {
      const messages = Array.isArray(conv.messages) ? conv.messages : [];
      messages.forEach((msg: any) => {
        if (msg.timestamp) {
          const date = new Date(msg.timestamp);
          const hour = date.getHours();
          acc[hour] = (acc[hour] || 0) + 1;
        }
      });
      return acc;
    }, {});

    const hourlyActivity = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      messages: messagesByHour[i] || 0,
    }));

    // Response time (simulated - you can enhance this based on your message structure)
    const avgResponseTime = '< 1 min'; // Placeholder

    return NextResponse.json({
      overview: {
        totalConversations,
        totalMessages,
        avgMessagesPerConversation,
        activeConversations,
        avgResponseTime,
      },
      timeline,
      hourlyActivity,
    });
  } catch (error) {
    console.error('Error fetching bot analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch bot analytics' },
      { status: 500 }
    );
  }
}
