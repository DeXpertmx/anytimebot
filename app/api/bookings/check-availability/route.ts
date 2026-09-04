import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateTimeSlots, parseTime, addMinutes } from '@/lib/utils';
import { listCalendarEvents } from '@/lib/google-calendar';
import {
  buildDayCandidates,
  chooseResourcePerSlot,
  type OpenWindow,
  type ResourceWithLocation,
} from '@/lib/resources';

export const dynamic = 'force-dynamic';

// Helper function to check availability
async function checkAvailability(eventTypeId: string, date: string, timezone: string = 'UTC') {
  try {

    // Get event type with booking page, availability and (optional) resources
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: {
        bookingPage: {
          include: {
            availability: true,
          },
        },
        allowedResources: {
          include: {
            resource: {
              include: {
                availabilities: true,
              },
            },
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
    const slotInterval = eventType.bookingPage.slotInterval || 15;

    // Get page availability for this day of week (open windows only)
    const pageWindows: OpenWindow[] = eventType.bookingPage.availability
      .filter((av) => av.dayOfWeek === dayOfWeek && av.isAvailable)
      .map((av) => ({ startTime: av.startTime, endTime: av.endTime }));

    // Resource-aware events: a slot is offered when at least one allowed,
    // active resource can take it (own schedule substitutes the page windows;
    // no rules = inherit them).
    const allowedResources: ResourceWithLocation[] = eventType.allowedResources
      .map((er) => er.resource)
      .filter((r) => r.isActive);

    const resourceMode = eventType.allowedResources.length > 0;

    // Candidate slot times for the day.
    let uniqueSlots: string[];
    if (resourceMode) {
      if (allowedResources.length === 0) {
        return {
          success: true,
          availableSlots: [],
          allSlots: [],
          date: requestedDate.toISOString().split('T')[0],
          dayOfWeek,
        };
      }
      uniqueSlots = buildDayCandidates(pageWindows, allowedResources, dayOfWeek, slotInterval);
      if (uniqueSlots.length === 0) {
        return {
          success: true,
          availableSlots: [],
          allSlots: [],
          date: requestedDate.toISOString().split('T')[0],
          dayOfWeek,
        };
      }
    } else {
      if (pageWindows.length === 0) {
        return {
          success: true,
          availableSlots: [],
          allSlots: [],
          date: requestedDate.toISOString().split('T')[0],
          dayOfWeek,
        };
      }
      const allSlots: string[] = [];
      for (const availability of pageWindows) {
        allSlots.push(...generateTimeSlots(availability.startTime, availability.endTime, slotInterval));
      }
      uniqueSlots = [...new Set(allSlots)].sort();
    }

    const startOfDay = new Date(requestedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(requestedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Owner time off (vacations / absences) blocks the whole day
    const activeTimeOff = await prisma.timeOff.findFirst({
      where: {
        userId: eventType.bookingPage.userId,
        start: { lte: endOfDay },
        end: { gte: startOfDay },
      },
    });

    if (activeTimeOff) {
      return {
        success: true,
        availableSlots: [],
        allSlots: [],
        date: requestedDate.toISOString().split('T')[0],
        dayOfWeek,
        timeOff: true,
      };
    }

    // ── Conflict sources ──────────────────────────────────────────────────────
    // Resource mode: capacity is per resource. Bookings assigned to one of the
    // allowed resources (whatever event type) count against that resource;
    // legacy bookings of THIS event type without a resource (created before the
    // resource feature) conservatively block every resource.
    // Non-resource mode: any active booking of this event type overlapping.
    let bookingsByResource = new Map<string, { startTime: Date; endTime: Date }[]>();
    let legacyOverlaps: { startTime: Date; endTime: Date }[] = [];
    let existingBookings: { startTime: Date; endTime: Date; resourceId: string | null }[] = [];

    if (resourceMode) {
      const resourceIds = allowedResources.map((r) => r.id);
      const [resourceBookings, legacyBookings] = await Promise.all([
        prisma.booking.findMany({
          where: {
            resourceId: { in: resourceIds },
            status: { in: ['CONFIRMED', 'PENDING'] },
            startTime: { lte: endOfDay },
            endTime: { gte: startOfDay },
          },
          select: { startTime: true, endTime: true, resourceId: true },
        }),
        prisma.booking.findMany({
          where: {
            eventTypeId,
            resourceId: null,
            status: { in: ['CONFIRMED', 'PENDING'] },
            startTime: { lte: endOfDay },
            endTime: { gte: startOfDay },
          },
          select: { startTime: true, endTime: true, resourceId: true },
        }),
      ]);

      for (const b of resourceBookings) {
        if (!b.resourceId) continue;
        const arr = bookingsByResource.get(b.resourceId) ?? [];
        arr.push({ startTime: new Date(b.startTime), endTime: new Date(b.endTime) });
        bookingsByResource.set(b.resourceId, arr);
      }
      legacyOverlaps = legacyBookings.map((b) => ({
        startTime: new Date(b.startTime),
        endTime: new Date(b.endTime),
      }));
    } else {
      existingBookings = await prisma.booking.findMany({
        where: {
          eventTypeId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          startTime: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        select: { startTime: true, endTime: true, resourceId: true },
      });
    }

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

    // Per-slot bookability.
    // Resource mode → chooseResourcePerSlot decides (schedule + capacity) and
    // returns which resource would serve each offered slot.
    // Non-resource mode → conflict against same-event-type bookings.
    const slotStartFor = (slot: string): Date => {
      const slotTime = parseTime(slot);
      const slotDate = new Date(requestedDate);
      slotDate.setHours(slotTime.hours, slotTime.minutes, 0, 0);
      return slotDate;
    };

    const availableSlots: { time: string; available: boolean; resourceId?: string | null }[] = [];

    // Build the slot list per mode.
    // Resource mode → chooseResourcePerSlot already filtered by schedule + capacity.
    // Non-resource mode → every candidate starts bookable; conflicts decided below.
    const slotTimes: { time: string; freeByResources: boolean }[] = resourceMode
      ? chooseResourcePerSlot({
          candidates: uniqueSlots,
          dayOfWeek,
          pageOpenWindows: pageWindows,
          resources: allowedResources,
          durationMinutes: eventType.duration,
          bufferMinutes: eventType.bufferTime,
          slotDateFor: slotStartFor,
          bookingsByResource,
          legacyOverlaps,
        }).map((o) => ({ time: o.time, freeByResources: true }))
      : uniqueSlots.map((slot) => ({ time: slot, freeByResources: true }));

    for (const { time: slot, freeByResources } of slotTimes) {
      const slotDate = slotStartFor(slot);
      const slotEndTime = addMinutes(slotDate, eventType.duration + eventType.bufferTime);

      let hasConflict = !freeByResources;

      // Non-resource mode: conflict against active bookings of this event type.
      if (!resourceMode && !hasConflict) {
        hasConflict = existingBookings.some((booking) => {
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
      }

      // Check if this slot conflicts with any Google Calendar event
      if (!hasConflict) {
        hasConflict = calendarEvents.some((event) => {
          if (!event.start || !event.end) return false;

          const eventStart = new Date(event.start.dateTime || event.start.date);
          const eventEnd = new Date(event.end.dateTime || event.end.date);

          return (
            (slotDate >= eventStart && slotDate < eventEnd) ||
            (slotEndTime > eventStart && slotEndTime <= eventEnd) ||
            (slotDate <= eventStart && slotEndTime >= eventEnd)
          );
        });
      }

      // Check if slot is in the past
      const now = new Date();
      const isPast = slotDate <= now;

      availableSlots.push({
        time: slot,
        available: !hasConflict && !isPast,
        resourceId: null,
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
