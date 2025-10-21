
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

    // Get all bookings in the period
    const totalBookings = await prisma.booking.count({
      where: {
        eventTypeId: { in: eventTypeIds },
        createdAt: { gte: startDate },
      },
    });

    // Get confirmed bookings
    const confirmedBookings = await prisma.booking.count({
      where: {
        eventTypeId: { in: eventTypeIds },
        status: 'CONFIRMED',
        createdAt: { gte: startDate },
      },
    });

    // Get cancelled bookings
    const cancelledBookings = await prisma.booking.count({
      where: {
        eventTypeId: { in: eventTypeIds },
        status: 'CANCELLED',
        createdAt: { gte: startDate },
      },
    });

    // Calculate conversion rate
    const conversionRate = totalBookings > 0
      ? Math.round((confirmedBookings / totalBookings) * 100)
      : 0;

    // Cancellation rate
    const cancellationRate = totalBookings > 0
      ? Math.round((cancelledBookings / totalBookings) * 100)
      : 0;

    // Conversion by event type
    const conversionByEventType = await Promise.all(
      eventTypes.map(async (eventType) => {
        const total = await prisma.booking.count({
          where: {
            eventTypeId: eventType.id,
            createdAt: { gte: startDate },
          },
        });

        const confirmed = await prisma.booking.count({
          where: {
            eventTypeId: eventType.id,
            status: 'CONFIRMED',
            createdAt: { gte: startDate },
          },
        });

        const rate = total > 0 ? Math.round((confirmed / total) * 100) : 0;

        return {
          name: eventType.name,
          total,
          confirmed,
          rate,
          color: eventType.color,
        };
      })
    );

    // Conversion timeline
    const bookings = await prisma.booking.findMany({
      where: {
        eventTypeId: { in: eventTypeIds },
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'asc' },
    });

    const conversionByDate = bookings.reduce((acc: any, booking) => {
      const date = booking.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { total: 0, confirmed: 0 };
      }
      acc[date].total++;
      if (booking.status === 'CONFIRMED') {
        acc[date].confirmed++;
      }
      return acc;
    }, {});

    // Fill in missing dates
    const timeline = [];
    for (let i = daysAgo - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const data = conversionByDate[dateStr] || { total: 0, confirmed: 0 };
      const rate = data.total > 0 ? Math.round((data.confirmed / data.total) * 100) : 0;
      
      timeline.push({
        date: dateStr,
        total: data.total,
        confirmed: data.confirmed,
        rate,
      });
    }

    // Top performing booking pages
    const topBookingPages = await Promise.all(
      bookingPages.map(async (page) => {
        const pageEventTypes = eventTypes.filter(et => et.bookingPageId === page.id);
        const pageEventTypeIds = pageEventTypes.map(et => et.id);

        const total = await prisma.booking.count({
          where: {
            eventTypeId: { in: pageEventTypeIds },
            createdAt: { gte: startDate },
          },
        });

        const confirmed = await prisma.booking.count({
          where: {
            eventTypeId: { in: pageEventTypeIds },
            status: 'CONFIRMED',
            createdAt: { gte: startDate },
          },
        });

        const rate = total > 0 ? Math.round((confirmed / total) * 100) : 0;

        return {
          title: page.title,
          slug: page.slug,
          total,
          confirmed,
          rate,
        };
      })
    );

    // Sort by conversion rate
    topBookingPages.sort((a, b) => b.rate - a.rate);

    return NextResponse.json({
      overview: {
        totalBookings,
        confirmedBookings,
        cancelledBookings,
        conversionRate,
        cancellationRate,
      },
      byEventType: conversionByEventType,
      timeline,
      topPages: topBookingPages.slice(0, 5),
    });
  } catch (error) {
    console.error('Error fetching conversion analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversion analytics' },
      { status: 500 }
    );
  }
}
