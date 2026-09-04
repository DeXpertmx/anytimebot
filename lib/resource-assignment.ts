/**
 * DB-backed resource assignment for a concrete slot (booking POST, reschedule).
 *
 * Reuses the pure helpers from lib/resources.ts: the schedule verdict combines
 * the booking page's open windows with the resource's own schedule, and
 * capacity is enforced by counting active bookings already assigned to that
 * resource (plus legacy resource-less bookings of the same event type, which
 * conservatively block every resource).
 */
import { prisma } from '@/lib/db';
import { addMinutes } from '@/lib/utils';
import {
  effectiveVerdict,
  countOverlaps,
  naiveSlotParts,
  type OverlappingBooking,
  type OpenWindow,
  type ResourceWithLocation,
} from '@/lib/resources';

export interface PickResult {
  resource: ResourceWithLocation;
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
  slotStart: Date;
  slotEnd: Date; // includes duration; buffer handled by caller via bufferMinutes
  bufferMinutes?: number;
  allowedResources: ResourceWithLocation[];
  preferredId?: string | null;
  excludeBookingId?: string | null; // booking being rescheduled (ignore its own overlap)
}): Promise<PickResult | null> {
  const {
    eventTypeId,
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

  // Page open windows for the slot's weekday (used only by resources with no
  // own rules — they inherit the page schedule).
  const pageAvailabilities = await prisma.availability.findMany({
    where: {
      OR: [{ bookingPageId: opts.bookingPageId }, { resourceId: { in: active.map((r) => r.id) } }],
    },
    select: { dayOfWeek: true, startTime: true, endTime: true, isAvailable: true, resourceId: true },
  });
  const { dayOfWeek } = naiveSlotParts(slotStart);
  const pageWindows: OpenWindow[] = pageAvailabilities
    .filter((a) => !a.resourceId && a.dayOfWeek === dayOfWeek && a.isAvailable)
    .map((a) => ({ startTime: a.startTime, endTime: a.endTime }));

  // Buffered span used for capacity checks (mirrors the availability check).
  const spanStart = slotStart;
  const spanEnd = addMinutes(slotEnd, bufferMinutes);

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

  const { minutes: startMin } = naiveSlotParts(spanStart);
  const { minutes: endMin } = naiveSlotParts(spanEnd);

  const free: { r: ResourceWithLocation; load: number }[] = [];
  for (const r of active) {
    if (!r.isActive) continue;
    const verdict = effectiveVerdict(r, pageWindows, dayOfWeek, startMin, endMin);
    if (verdict === 'closed') continue;
    const overlaps = [...(byResource.get(r.id) ?? []), ...legacy];
    if (countOverlaps(overlaps, spanStart, spanEnd) >= Math.max(1, r.capacity)) continue;
    free.push({ r, load: countOverlaps(byResource.get(r.id) ?? [], spanStart, spanEnd) });
  }
  if (free.length === 0) return null;

  const preferred = preferredId ? free.find((f) => f.r.id === preferredId) : undefined;
  const chosen = preferred ?? free.sort((a, b) => a.load - b.load)[0];
  return { resource: chosen.r };
}
