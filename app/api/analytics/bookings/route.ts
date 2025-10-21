
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

    // Get bookings by day
    const bookings = await prisma.booking.findMany({
      where: {
        eventTypeId: { in: eventTypeIds },
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const bookingsByDate = bookings.reduce((acc: any, booking) => {
      const date = booking.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          total: 0,
          confirmed: 0,
          pending: 0,
          cancelled: 0,
        };
      }
      acc[date].total++;
      if (booking.status === 'CONFIRMED') acc[date].confirmed++;
      if (booking.status === 'PENDING') acc[date].pending++;
      if (booking.status === 'CANCELLED') acc[date].cancelled++;
      return acc;
    }, {});

    // Fill in missing dates
    const result = [];
    for (let i = daysAgo - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      result.push({
        date: dateStr,
        ...(bookingsByDate[dateStr] || { total: 0, confirmed: 0, pending: 0, cancelled: 0 }),
      });
    }

    // Get bookings by event type
    const bookingsByEventType = await prisma.booking.groupBy({
      by: ['eventTypeId'],
      where: {
        eventTypeId: { in: eventTypeIds },
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    const eventTypeStats = await Promise.all(
      bookingsByEventType.map(async (stat) => {
        const eventType = eventTypes.find(et => et.id === stat.eventTypeId);
        return {
          name: eventType?.name || 'Unknown',
          count: stat._count,
          color: eventType?.color || '#6366f1',
        };
      })
    );

    // Get bookings by status
    const bookingsByStatus = await prisma.booking.groupBy({
      by: ['status'],
      where: {
        eventTypeId: { in: eventTypeIds },
        createdAt: { gte: startDate },
      },
      _count: true,
    });

    const statusStats = bookingsByStatus.map((stat) => ({
      status: stat.status,
      count: stat._count,
    }));

    // Peak booking hours
    const bookingsByHour = bookings.reduce((acc: any, booking) => {
      const hour = booking.startTime.getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    const hourlyStats = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      count: bookingsByHour[i] || 0,
    }));

    return NextResponse.json({
      timeline: result,
      byEventType: eventTypeStats,
      byStatus: statusStats,
      byHour: hourlyStats,
    });
  } catch (error) {
    console.error('Error fetching booking analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch booking analytics' },
      { status: 500 }
    );
  }
}
