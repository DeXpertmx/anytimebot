/**
 * DB-backed resource assignment for a concrete slot (booking POST, reschedule).
 *
 * Phase B semantics (consistent with lib/availability-engine.ts):
 *
 *   • The booking page schedule is expressed in the OWNER's timezone
 *     (`user.timezone`, fallback UTC — the legacy clock).
 *   • A resource WITHOUT own schedule rules inherits the page schedule
 *     (evaluated in the page timezone).
 *   • A resource WITH own rules substitutes the page schedule; its windows
 *     live in the timezone of its sede (`resource.location.timezone`).
 *   • Per-resource time off (TimeOff.resourceId) blocks that resource only;
 *     an owner-wide absence (resourceId null) blocks the whole slot.
 *   • Capacity is enforced by counting active bookings already assigned to
 *     that resource (plus legacy resource-less bookings of the same event
 *     type, which conservatively block every resource).
 */
import { prisma } from '@/lib/db';
import { addMinutes } from '@/lib/utils';
import {
  localSlotParts,
  resourceVerdict,
  countOverlaps,
  type OverlappingBooking,
  type AvailabilityRule,
} from '@/lib/resources';
import { isInsideDayWindows, type DayWindow } from '@/lib/availability-engine';

export interface PickResourceLike {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  availabilities: AvailabilityRule[];
  location?: { id: string; name: string | null; address: string | null; timezone: string | null } | null;
}

export interface PickResult {
  resource: PickResourceLike;
}

/**
 * Pick the least-loaded active allowed resource free at [slotStart, slotEnd),
 * or null when none is free. `preferredId` (guest-requested chair) wins when
 * free.
 *
 * Expects `allowedResources` preloaded WITH `availabilities` and `location`
 * (include: { allowedResources: { include: { resource: { include: {
 * availabilities: true, location: true } } } } }).
 */
export async function pickResourceForSlot(opts: {
  eventTypeId: string;
  bookingPageId: string;
  userId: string; // owner (for timezone anchor + time-off lookup)
  slotStart: Date;
  slotEnd: Date; // includes duration; buffer handled by caller via bufferMinutes
  bufferMinutes?: number;
  allowedResources: PickResourceLike[];
  preferredId?: string | null;
  excludeBookingId?: string | null; // booking being rescheduled (ignore its own overlap)
}): Promise<PickResult | null> {
  const {
    eventTypeId,
    bookingPageId,
    userId,
    slotStart,
    slotEnd,
    bufferMinutes = 0,
    allowedResources,
    preferredId,
    excludeBookingId,
  } = opts;

  const active = allowedResources.filter((r) => r.isActive);
  if (active.length === 0) return null;

  const excludeFilter = excludeBookingId ? { id: { not: excludeBookingId } } : {};
  const spanStart = slotStart;
  const spanEnd = addMinutes(slotEnd, bufferMinutes);

  const [owner, pageAvailabilities, timeOffs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    }),
    prisma.availability.findMany({
      where: { bookingPageId },
      select: { dayOfWeek: true, startTime: true, endTime: true, isAvailable: true },
    }),
    prisma.timeOff.findMany({
      where: {
        userId,
        start: { lte: spanEnd },
        end: { gte: spanStart },
      },
      select: { resourceId: true },
    }),
  ]);

  const anchorTz = owner?.timezone || 'UTC';

  // Owner-wide absence covering the slot → nothing can be assigned.
  if (timeOffs.some((t) => !t.resourceId)) return null;
  const blockedResourceIds = new Set(
    timeOffs.filter((t) => t.resourceId).map((t) => t.resourceId as string)
  );

  // Page open windows (day/weekday rules in the owner's timezone).
  const pageWindows: DayWindow[] = pageAvailabilities
    .filter((a) => a.isAvailable)
    .map((a) => ({ dayOfWeek: a.dayOfWeek, startTime: a.startTime, endTime: a.endTime }));

  const resourceIds = active.map((r) => r.id);
  const [resourceBookings, legacyBookings] = await Promise.all([
    prisma.booking.findMany({
      where: {
        ...excludeFilter,
        resourceId: { in: resourceIds },
        status: { in: ['CONFIRMED', 'PENDING'] },
        startTime: { lt: spanEnd },
        endTime: { gt: spanStart },
      },
      select: { startTime: true, endTime: true, resourceId: true },
    }),
    prisma.booking.findMany({
      where: {
        ...excludeFilter,
        eventTypeId,
        resourceId: null,
        status: { in: ['CONFIRMED', 'PENDING'] },
        startTime: { lt: spanEnd },
        endTime: { gt: spanStart },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  const byResource = new Map<string, OverlappingBooking[]>();
  for (const b of resourceBookings) {
    if (!b.resourceId) continue;
    const arr = byResource.get(b.resourceId) ?? [];
    arr.push({ startTime: new Date(b.startTime), endTime: new Date(b.endTime) });
    byResource.set(b.resourceId, arr);
  }
  const legacy = legacyBookings.map((b) => ({
    startTime: new Date(b.startTime),
    endTime: new Date(b.endTime),
  }));

  const pageStart = localSlotParts(spanStart, anchorTz);
  const pageEnd = localSlotParts(spanEnd, anchorTz);

  const free: { r: (typeof active)[number]; load: number }[] = [];
  for (const r of active) {
    if (blockedResourceIds.has(r.id)) continue;

    let open: boolean;
    if (r.availabilities.length === 0) {
      // Inherit the page schedule (page timezone).
      open = isInsideDayWindows(pageWindows, pageStart.dayOfWeek, pageStart.minutes, pageEnd.minutes);
    } else {
      // Own rules substitute the page schedule, in the sede timezone.
      const tz = r.location?.timezone || anchorTz;
      const sp = localSlotParts(spanStart, tz);
      const ep = localSlotParts(spanEnd, tz);
      open = resourceVerdict({ availabilities: r.availabilities }, sp.dayOfWeek, sp.minutes, ep.minutes) === 'open';
    }
    if (!open) continue;

    const overlaps = [...(byResource.get(r.id) ?? []), ...legacy];
    if (countOverlaps(overlaps, spanStart, spanEnd) >= Math.max(1, r.capacity)) continue;
    free.push({ r, load: countOverlaps(byResource.get(r.id) ?? [], spanStart, spanEnd) });
  }
  if (free.length === 0) return null;

  const preferred = preferredId ? free.find((f) => f.r.id === preferredId) : undefined;
  const chosen = preferred ?? free.sort((a, b) => a.load - b.load)[0];
  return { resource: chosen.r };
}
