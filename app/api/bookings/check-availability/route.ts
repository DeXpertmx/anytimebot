
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateTimeSlots, parseTime, addMinutes } from '@/lib/utils';
import { listCalendarEvents } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

// Helper function to check availability
async function checkAvailability(eventTypeId: string, date: string, timezone: string = 'UTC') {
  try {

    // Get event type with booking page and availability
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: {
        bookingPage: {
          include: {
            availability: true,
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    if (!eventType.bookingPage.isActive) {
      return NextResponse.json(
        { success: false, error: 'Booking page is not active' },
        { status: 400 }
      );
    }

    const requestedDate = new Date(date);
    const dayOfWeek = requestedDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Get availability for this day of week
    const dayAvailability = eventType.bookingPage.availability.filter(
      (av) => av.dayOfWeek === dayOfWeek && av.isAvailable
    );

    if (dayAvailability.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          availableSlots: [],
          date: requestedDate.toISOString().split('T')[0],
          dayOfWeek,
        },
      });
    }

    // Generate all possible time slots for this day
    const slotInterval = eventType.bookingPage.slotInterval || 15;
    const allSlots: string[] = [];
    for (const availability of dayAvailability) {
      const daySlots = generateTimeSlots(
        availability.startTime,
        availability.endTime,
        slotInterval
      );
      allSlots.push(...daySlots);
    }

    // Remove duplicates and sort
    const uniqueSlots = [...new Set(allSlots)].sort();

    // Get existing bookings for this date and event type
    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await prisma.booking.findMany({
      where: {
        eventTypeId,
        status: { in: ['CONFIRMED', 'PENDING'] },
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // Get Google Calendar events if user has calendar sync enabled
    let calendarEvents: any[] = [];
    const bookingOwner = await prisma.user.findUnique({
      where: { id: eventType.bookingPage.userId },
      select: {
        id: true,
        calendarSyncEnabled: true,
        accounts: {
          where: { provider: 'google' },
          select: { access_token: true }
        }
      },
    });

    if (bookingOwner?.calendarSyncEnabled && bookingOwner.accounts.length > 0 && bookingOwner.accounts[0].access_token) {
      try {
        calendarEvents = await listCalendarEvents(
          bookingOwner.id,
          startOfDay,
          endOfDay
        );
      } catch (error) {
        console.error('Error fetching calendar events:', error);
        // Continue without calendar events if there's an error
      }
    }

    // Check each slot for availability
    const availableSlots: { time: string; available: boolean }[] = [];

    for (const slot of uniqueSlots) {
      const slotTime = parseTime(slot);
      const slotDate = new Date(requestedDate);
      slotDate.setHours(slotTime.hours, slotTime.minutes, 0, 0);

      const slotEndTime = addMinutes(slotDate, eventType.duration + eventType.bufferTime);

      // Check if this slot conflicts with any existing booking
      const hasBookingConflict = existingBookings.some((booking) => {
        const bookingStart = new Date(booking.startTime);
        const bookingEnd = new Date(booking.endTime);
        
        // Add buffer time to existing bookings
        const bufferedEnd = addMinutes(bookingEnd, eventType.bufferTime);
        
        return (
          (slotDate >= bookingStart && slotDate < bufferedEnd) ||
          (slotEndTime > bookingStart && slotEndTime <= bufferedEnd) ||
          (slotDate <= bookingStart && slotEndTime >= bufferedEnd)
        );
      });

      // Check if this slot conflicts with any Google Calendar event
      const hasCalendarConflict = calendarEvents.some((event) => {
        if (!event.start || !event.end) return false;
        
        const eventStart = new Date(event.start.dateTime || event.start.date);
        const eventEnd = new Date(event.end.dateTime || event.end.date);
        
        return (
          (slotDate >= eventStart && slotDate < eventEnd) ||
          (slotEndTime > eventStart && slotEndTime <= eventEnd) ||
          (slotDate <= eventStart && slotEndTime >= eventEnd)
        );
      });

      const hasConflict = hasBookingConflict || hasCalendarConflict;

      // Check if slot is in the past
      const now = new Date();
      const isPast = slotDate <= now;

      availableSlots.push({
        time: slot,
        available: !hasConflict && !isPast,
      });
    }

    return {
      success: true,
      availableSlots: availableSlots.filter(slot => slot.available).map(slot => slot.time),
      allSlots: availableSlots,
      date: requestedDate.toISOString().split('T')[0],
      dayOfWeek,
      eventType: {
        name: eventType.name,
        duration: eventType.duration,
        bufferTime: eventType.bufferTime,
      },
    };
  } catch (error) {
    console.error('Error checking availability:', error);
    throw error;
  }
}

// GET /api/bookings/check-availability - Check available time slots
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventTypeId = searchParams.get('eventTypeId');
    const date = searchParams.get('date');
    const timezone = searchParams.get('timezone') || 'UTC';

    if (!eventTypeId || !date) {
      return NextResponse.json(
        { success: false, error: 'Event type ID and date are required' },
        { status: 400 }
      );
    }

    const result = await checkAvailability(eventTypeId, date, timezone);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking availability (GET):', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/bookings/check-availability - Check available time slots
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventTypeId, date, timezone = 'UTC' } = body;

    if (!eventTypeId || !date) {
      return NextResponse.json(
        { success: false, error: 'Event type ID and date are required' },
        { status: 400 }
      );
    }

    const result = await checkAvailability(eventTypeId, date, timezone);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking availability (POST):', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
