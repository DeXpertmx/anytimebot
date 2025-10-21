
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

    // Get date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get booking pages
    const bookingPages = await prisma.bookingPage.findMany({
      where: { userId: user.id },
    });

    const bookingPageIds = bookingPages.map(bp => bp.id);

    // Get event types
    const eventTypes = await prisma.eventType.findMany({
      where: { bookingPageId: { in: bookingPageIds } },
    });

    const eventTypeIds = eventTypes.map(et => et.id);

    // Total bookings this month
    const totalBookingsThisMonth = await prisma.booking.count({
      where: {
        eventTypeId: { in: eventTypeIds },
        createdAt: { gte: startOfMonth },
      },
    });

    // Total bookings last month
    const totalBookingsLastMonth = await prisma.booking.count({
      where: {
        eventTypeId: { in: eventTypeIds },
        createdAt: {
          gte: startOfLastMonth,
          lte: endOfLastMonth,
        },
      },
    });

    // Calculate percentage change
    const bookingsChange = totalBookingsLastMonth > 0
      ? ((totalBookingsThisMonth - totalBookingsLastMonth) / totalBookingsLastMonth) * 100
      : 100;

    // Confirmed bookings this month
    const confirmedBookingsThisMonth = await prisma.booking.count({
      where: {
        eventTypeId: { in: eventTypeIds },
        status: 'CONFIRMED',
        createdAt: { gte: startOfMonth },
      },
    });

    // Confirmed bookings last month
    const confirmedBookingsLastMonth = await prisma.booking.count({
      where: {
        eventTypeId: { in: eventTypeIds },
        status: 'CONFIRMED',
        createdAt: {
          gte: startOfLastMonth,
          lte: endOfLastMonth,
        },
      },
    });

    const confirmedChange = confirmedBookingsLastMonth > 0
      ? ((confirmedBookingsThisMonth - confirmedBookingsLastMonth) / confirmedBookingsLastMonth) * 100
      : 100;

    // Cancelled bookings this month
    const cancelledBookingsThisMonth = await prisma.booking.count({
      where: {
        eventTypeId: { in: eventTypeIds },
        status: 'CANCELLED',
        createdAt: { gte: startOfMonth },
      },
    });

    // Bot conversations
    const bots = await prisma.bot.findMany({
      where: { userId: user.id },
    });

    const botIds = bots.map(b => b.id);

    const totalConversations = await prisma.botConversation.count({
      where: { botId: { in: botIds } },
    });

    const conversationsThisMonth = await prisma.botConversation.count({
      where: {
        botId: { in: botIds },
        createdAt: { gte: startOfMonth },
      },
    });

    const conversationsLastMonth = await prisma.botConversation.count({
      where: {
        botId: { in: botIds },
        createdAt: {
          gte: startOfLastMonth,
          lte: endOfLastMonth,
        },
      },
    });

    const conversationsChange = conversationsLastMonth > 0
      ? ((conversationsThisMonth - conversationsLastMonth) / conversationsLastMonth) * 100
      : 100;

    // WhatsApp messages
    const whatsappMessagesThisMonth = await prisma.whatsAppMessage.count({
      where: {
        userId: user.id,
        createdAt: { gte: startOfMonth },
      },
    });

    const whatsappMessagesLastMonth = await prisma.whatsAppMessage.count({
      where: {
        userId: user.id,
        createdAt: {
          gte: startOfLastMonth,
          lte: endOfLastMonth,
        },
      },
    });

    const whatsappChange = whatsappMessagesLastMonth > 0
      ? ((whatsappMessagesThisMonth - whatsappMessagesLastMonth) / whatsappMessagesLastMonth) * 100
      : 100;

    return NextResponse.json({
      bookings: {
        total: totalBookingsThisMonth,
        change: Math.round(bookingsChange),
      },
      confirmed: {
        total: confirmedBookingsThisMonth,
        change: Math.round(confirmedChange),
      },
      cancelled: {
        total: cancelledBookingsThisMonth,
      },
      conversations: {
        total: conversationsThisMonth,
        change: Math.round(conversationsChange),
      },
      whatsapp: {
        total: whatsappMessagesThisMonth,
        change: Math.round(whatsappChange),
      },
    });
  } catch (error) {
    console.error('Error fetching analytics overview:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
