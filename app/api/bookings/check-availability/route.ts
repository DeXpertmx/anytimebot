import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { addMinutes } from '@/lib/utils';
import { listCalendarEvents } from '@/lib/google-calendar';
import {
  computeDayOffers,
  daySpanInTz,
  weekdayOfYmd,
  instantOverlapsRange,
  type DayWindow,
  type EngineResource,
} from '@/lib/availability-engine';
import { totalDuration, maxBuffer, combinedName } from '@/lib/multi-service';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/bookings/check-availability
 *
 * Timezone-aware availability (Phase B — "sedes con huso propio"):
 *
 *   • anchorTz — the timezone the page schedule (and each sede resource's own
 *     windows) is expressed in. Resolved from the owner's account timezone;
 *     defaults to UTC, which reproduces the legacy naive behaviour.
 *   • guestTz — timezone sent by the guest (optional). When present, the
 *     picked calendar day is treated as a real day in the guest's timezone and
 *     the returned slot strings are rendered in the guest's own timezone.
 *
 * When no timezone is sent the behaviour is byte-for-byte the previous one
 * (anchor = guest day = UTC-style wall clocks).
 */
async function checkAvailability(
  eventTypeIds: string[],
  date: string,
  timezone: string | null,
  requestedLocationId?: string | null,
) {
  try {
    // Get the event types (services) with booking page, availability and
    // (optional) resources. Multi-service bookings combine several services
    // into one consecutive block: total duration = sum of every duration.
    const eventTypes = await prisma.eventType.findMany({
      where: { id: { in: eventTypeIds } },
      include: {
        bookingPage: {
          include: {
            availability: true,
            user: { select: { id: true, timezone: true } },
          },
        },
        defaultLocation: { select: { id: true, name: true, address: true, timezone: true } },
        // Branches where this event is offered (multi-sede picker).
        locations: {
          include: {
            location: { select: { id: true, name: true, address: true, timezone: true } },
          },
        },
        allowedResources: {
          include: {
            resource: {
              include: {
                availabilities: true,
                location: { select: { id: true, timezone: true } },
              },
            },
          },
        },
      },
    });

    if (eventTypes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    // Primary = first selected service; every service must live on the same
    // booking page so the schedule/windows/slot interval stay consistent.
    const eventType = eventTypes[0];
    const samePage = eventTypes.every((et) => et.bookingPageId === eventType.bookingPageId);
    if (!samePage) {
      return NextResponse.json(
        { success: false, error: 'Los servicios deben pertenecer a la misma página de reservas' },
        { status: 400 }
      );
    }

    if (!eventType.bookingPage.isActive) {
      return NextResponse.json(
        { success: false, error: 'Booking page is not active' },
        { status: 400 }
      );
    }

    // Combined block: sum of the selected services' durations, largest buffer.
    const durationMinutes = totalDuration(eventTypes);
    const bufferMinutes = maxBuffer(eventTypes);

    // The schedule anchor: the sede's clock when the event type is offered in
    // one (Phase B) — or, when the guest picked a branch, THAT branch's clock.
    // Without any sede the owner's own clock is used, falling back to 'UTC'
    // (the legacy naive behaviour). Resources with own schedules may still
    // carry a different sede clock (resolved per resource in the engine).
    // Resources: a combined block must fit on ONE resource allowed by EVERY
    // selected service (intersection). If any service ignores resources, the
    // whole block is treated as a plain (non-resource) slot.
    const allResourceBased = eventTypes.every((et) => et.allowedResources.length > 0);
    const resourceMode = allResourceBased;

    // Resolve the branch. The picker runs when the event is offered in several
    // sedes; the requested id must be one of them (or the legacy default).
    // Branches: only sedes where EVERY selected service is offered can host a
    // combined booking (intersection). Legacy single-branch events fall back
    // to the primary's default location.
    const branchLists = eventTypes.map((et) => et.locations.map((l) => l.location));
    let offered = branchLists[0];
    for (const branches of branchLists.slice(1)) {
      const ids = new Set(branches.map((b) => b.id));
      offered = offered.filter((b) => ids.has(b.id));
    }
    const resolvedBranch =
      (requestedLocationId &&
        offered.find((l) => l.id === requestedLocationId)) ||
      (requestedLocationId &&
        offered.length === 0 &&
        eventType.defaultLocation?.id === requestedLocationId
        ? eventType.defaultLocation
        : null) ||
      null;

    // Intersection of the resources allowed by every selected service.
    const resourceSets = eventTypes.map((et) =>
      et.allowedResources.map((er) => er.resource),
    );
    let allowedResources = resourceSets[0] ?? [];
    for (const set of resourceSets.slice(1)) {
      const ids = new Set(set.map((r) => r.id));
      allowedResources = allowedResources.filter((r) => ids.has(r.id));
    }
    allowedResources = allowedResources.filter((r) => r.isActive);

    // Resource-mode events offered in several sedes: only the resources of the
    // chosen branch (plus floating resources without a sede) are candidates.
    if (offered.length > 1 && resolvedBranch) {
      allowedResources = allowedResources.filter(
        (r) => !r.location || r.location.id === resolvedBranch.id
      );
    }

    const defaultSedeTz =
      (resolvedBranch?.timezone as string | null) ||
      eventType.defaultLocation?.timezone ||
      null;
    const anchorTz = defaultSedeTz || eventType.bookingPage.user.timezone || 'UTC';

    // A real second clock exists when the event is tied to a sede (default
    // location or sede-bound resources): the guest's picked day is then a true
    // day in THEIR timezone and slots are returned converted to it. Everything
    // else keeps the owner's wall clock (legacy behaviour, unchanged strings).
    const sedeClocks =
      Boolean(defaultSedeTz) ||
      (resourceMode && allowedResources.some((r) => Boolean(r.location?.timezone)));
    const useGuestTz = sedeClocks && Boolean(timezone);
    const rangeTz = useGuestTz ? (timezone as string) : anchorTz;
    const displayTz = useGuestTz ? (timezone as string) : anchorTz;
    const slotInterval = eventType.bookingPage.slotInterval || 15;

    // Guest-picked calendar day as a real instant range.
    const range = daySpanInTz(date, rangeTz);

    // Page open windows (weekday rules, page timezone).
    const pageOpenWindows: DayWindow[] = eventType.bookingPage.availability
      .filter((av) => av.isAvailable)
      .map((av) => ({
        dayOfWeek: av.dayOfWeek,
        startTime: av.startTime,
        endTime: av.endTime,
      }));

    // Resource-aware events: a slot is offered when at least one allowed,
    // active resource can take it (own schedule substitutes the page windows;
    // no rules = inherit them). Each resource's own windows live in the
    // timezone of its sede (location.timezone).
    if (resourceMode && allowedResources.length === 0) {
      return {
        success: true,
        availableSlots: [],
        allSlots: [],
        date,
        dayOfWeek: weekdayOfYmd(date, rangeTz),
      };
    }

    // ── Time off ────────────────────────────────────────────────────────────
    // Owner-wide absence (resourceId = null) blocks the whole day, exactly as
    // before. Per-resource absence only blocks that resource for the day.
    const timeOffs = await prisma.timeOff.findMany({
      where: {
        userId: eventType.bookingPage.userId,
        start: { lte: range.end },
        end: { gte: range.start },
      },
      select: { resourceId: true },
    });

    const ownerBlockedDay = timeOffs.some((t) => !t.resourceId);
    if (ownerBlockedDay) {
      return {
        success: true,
        availableSlots: [],
        allSlots: [],
        date,
        dayOfWeek: weekdayOfYmd(date, rangeTz),
        timeOff: true,
      };
    }
    const blockedResourceIds = new Set(
      timeOffs.filter((t) => t.resourceId).map((t) => t.resourceId as string)
    );

    // ── Conflict sources ────────────────────────────────────────────────────
    // Resource mode: capacity is per resource. Bookings assigned to one of the
    // allowed resources (whatever event type) count against that resource;
    // legacy bookings of THIS event type without a resource (created before
    // the resource feature) conservatively block every resource.
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
            startTime: { lte: range.end },
            endTime: { gte: range.start },
          },
          select: { startTime: true, endTime: true, resourceId: true },
        }),
        prisma.booking.findMany({
          where: {
            eventTypeId: { in: eventTypeIds },
            resourceId: null,
            status: { in: ['CONFIRMED', 'PENDING'] },
            startTime: { lte: range.end },
            endTime: { gte: range.start },
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
          eventTypeId: { in: eventTypeIds },
          status: { in: ['CONFIRMED', 'PENDING'] },
          startTime: { lte: range.end },
          endTime: { gte: range.start },
        },
        select: { startTime: true, endTime: true, resourceId: true },
      });
    }

    // Google Calendar events if the user has calendar sync enabled
    let calendarEvents: any[] = [];
    const bookingOwner = await prisma.user.findUnique({
      where: { id: eventType.bookingPage.userId },
      select: {
        id: true,
        calendarSyncEnabled: true,
        accounts: {
          where: { provider: 'google' },
          select: { access_token: true },
        },
      },
    });

    if (bookingOwner?.calendarSyncEnabled && bookingOwner.accounts.length > 0 && bookingOwner.accounts[0].access_token) {
      try {
        calendarEvents = await listCalendarEvents(bookingOwner.id, range.start, range.end);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
        // Continue without calendar events if there's an error
      }
    }

    // Resources → engine input.
    const engineResources: EngineResource[] = allowedResources.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      isActive: r.isActive,
      timezone: r.location?.timezone || null,
      rules: r.availabilities,
      blockedToday: blockedResourceIds.has(r.id),
    }));

    // Core scheduling (schedule + capacity + per-resource closures).
    const offers = computeDayOffers({
      guestDate: date,
      guestTz: rangeTz,
      anchorTz,
      displayTz,
      pageOpenWindows,
      resources: engineResources,
      slotInterval,
      durationMinutes,
      bufferMinutes,
      legacyOverlaps,
      overlapsByResource: bookingsByResource,
    });

    const now = new Date();

    const allSlots: { time: string; available: boolean; resourceId?: string | null }[] = [];
    for (const offer of offers) {
      const slotStart = offer.instant;
      const slotEnd = addMinutes(slotStart, durationMinutes + bufferMinutes);

      let hasConflict = false;

      // Non-resource mode: conflict against active bookings of the selected
      // services (any of them — a combined block must not overlap either).
      if (!resourceMode) {
        hasConflict = existingBookings.some((booking) => {
          const bookingStart = new Date(booking.startTime);
          const bookingEnd = new Date(booking.endTime);
          // Add buffer time to existing bookings
          const bufferedEnd = addMinutes(bookingEnd, bufferMinutes);
          return (
            (slotStart >= bookingStart && slotStart < bufferedEnd) ||
            (slotEnd > bookingStart && slotEnd <= bufferedEnd) ||
            (slotStart <= bookingStart && slotEnd >= bufferedEnd)
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
            (slotStart >= eventStart && slotStart < eventEnd) ||
            (slotEnd > eventStart && slotEnd <= eventEnd) ||
            (slotStart <= eventStart && slotEnd >= eventEnd)
          );
        });
      }

      // Past slots are never offered.
      const isPast = slotStart.getTime() <= now.getTime();

      allSlots.push({
        time: offer.time,
        available: !hasConflict && !isPast,
        resourceId: offer.resourceId,
      });
    }

    return {
      success: true,
      availableSlots: allSlots.filter((slot) => slot.available).map((slot) => slot.time),
      allSlots,
      date,
      dayOfWeek: weekdayOfYmd(date, rangeTz),
      eventType: {
        name: combinedName(eventTypes),
        duration: durationMinutes,
        bufferTime: bufferMinutes,
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
    const timezone = searchParams.get('timezone') || null;
    const locationId = searchParams.get('locationId') || null;

    if (!eventTypeId || !date) {
      return NextResponse.json(
        { success: false, error: 'Event type ID and date are required' },
        { status: 400 }
      );
    }

    const result = await checkAvailability([eventTypeId], date, timezone, locationId);
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
    const { eventTypeId, eventTypeIds, date, timezone = null, locationId = null } = body;

    const ids = Array.isArray(eventTypeIds) && eventTypeIds.length > 0
      ? eventTypeIds
      : eventTypeId
        ? [eventTypeId]
        : [];

    if (ids.length === 0 || !date) {
      return NextResponse.json(
        { success: false, error: 'Event type ID and date are required' },
        { status: 400 }
      );
    }

    const result = await checkAvailability(ids, date, timezone, locationId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error checking availability (POST):', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
