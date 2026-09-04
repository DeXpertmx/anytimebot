/**
 * Resources & Locations — pure scheduling helpers (Phase A).
 *
 * A resource (room / chair / equipment) is bookable when:
 *   1. it has no schedule rules of its own  → inherit the booking page schedule
 *      (the caller keeps applying page availability, as today), or
 *   2. it has rules → they SUBSTITUTE the page schedule for that resource:
 *      the slot must fall inside an `isAvailable` window of the right weekday.
 *      A weekday with no open window is closed for that resource.
 *
 * These helpers are pure and dependency-free on purpose: callers (the
 * availability check, the booking POST, reschedule) inject prisma results, so
 * tests never need a database.
 *
 * Overlap semantics: a slot conflicts when the number of ACTIVE bookings on the
 * same resource overlapping it is >= resource.capacity (capacity = 1 means
 * exclusive, which is the common case).
 */

export interface AvailabilityRule {
  id?: string;
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string; // "HH:MM" (24h)
  endTime: string; // "HH:MM" (24h)
  isAvailable: boolean;
}

export interface ResourceLike {
  id: string;
  capacity: number;
  isActive: boolean;
  availabilities: AvailabilityRule[];
}

export interface OverlappingBooking {
  startTime: Date;
  endTime: Date;
}

export type SlotVerdict = 'open' | 'closed' | 'inherit';

/** "HH:MM" → minutes since midnight. Returns -1 for malformed input. */
export function timeToMinutes(time: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return -1;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return -1;
  return h * 60 + min;
}

/** Split interval start/end into minutes; the caller decides how to treat negatives. */
export function intervalToMinutes(startTime: string, endTime: string): { startMin: number; endMin: number } {
  return { startMin: timeToMinutes(startTime), endMin: timeToMinutes(endTime) };
}

/**
 * True when the resource has schedule rules of its own (any day). A resource
 * with rules does NOT inherit the page schedule; without rules it does.
 */
export function hasOwnSchedule(resource: Pick<ResourceLike, 'availabilities'>): boolean {
  return resource.availabilities.length > 0;
}

/**
 * Day-of-week + minute parts of an instant in a given IANA timezone, using
 * Intl (DST-safe). Returned as { dayOfWeek, minutes } where minutes is
 * wall-clock minutes since midnight in that timezone.
 */
export function localSlotParts(isoStart: Date, timezone: string): { dayOfWeek: number; minutes: number } {
  // en-US gives "Sun".."Sat" and a 24h "HH:mm" via hourCycle h23.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(isoStart);
  const byType = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  const weekday = byType.weekday ?? 'Sun';
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(byType.hour ?? '0');
  const minute = Number(byType.minute ?? '0');
  return { dayOfWeek: map[weekday] ?? 0, minutes: hour * 60 + minute };
}

/**
 * Verdict of a slot against a resource's OWN schedule.
 *   - no rules at all        → 'inherit' (page schedule applies)
 *   - slot inside an open    → 'open'
 *     window for its weekday
 *   - otherwise              → 'closed'
 *
 * Closed windows (isAvailable: false) win over open ones, so a maintenance
 * window can block part of an otherwise-open day.
 */
export function resourceVerdict(
  resource: Pick<ResourceLike, 'availabilities'>,
  dayOfWeek: number,
  slotStartMin: number,
  slotEndMin: number
): SlotVerdict {
  const rules = resource.availabilities;
  if (rules.length === 0) return 'inherit';

  const dayRules = rules.filter((r) => r.dayOfWeek === dayOfWeek);
  if (dayRules.length === 0) return 'closed';

  // Any closed rule overlapping the slot blocks it.
  for (const rule of dayRules) {
    if (!rule.isAvailable) {
      const { startMin, endMin } = intervalToMinutes(rule.startTime, rule.endTime);
      if (startMin < 0 || endMin < 0) continue;
      if (slotStartMin < endMin && slotEndMin > startMin) return 'closed';
    }
  }
  // Otherwise the slot must fit inside at least one open window.
  for (const rule of dayRules) {
    if (!rule.isAvailable) continue;
    const { startMin, endMin } = intervalToMinutes(rule.startTime, rule.endTime);
    if (startMin < 0 || endMin < 0) continue;
    if (slotStartMin >= startMin && slotEndMin <= endMin) return 'open';
  }
  return 'closed';
}

/**
 * True when the resource is active, is not blocked by its own schedule for the
 * slot, and fewer than `capacity` active bookings overlap it.
 * Pass `verdict` precomputed (cheaper in loops over many slots).
 */
export function resourceCanTakeSlot(
  resource: ResourceLike,
  slotStart: Date,
  slotEnd: Date,
  timezone: string,
  activeOverlaps: OverlappingBooking[],
  verdict?: SlotVerdict
): boolean {
  if (!resource.isActive) return false;

  const v = verdict ?? resourceVerdict(resource, localSlotParts(slotStart, timezone).dayOfWeek,
    localSlotParts(slotStart, timezone).minutes, localSlotParts(slotEnd, timezone).minutes);
  if (v === 'closed') return false;
  // 'inherit' → caller already applied page availability; only capacity matters here.

  const overlaps = countOverlaps(activeOverlaps, slotStart, slotEnd);
  return overlaps < Math.max(1, resource.capacity);
}

/** Count of intervals overlapping [start, end). Open interval semantics. */
export function countOverlaps(bookings: OverlappingBooking[], start: Date, end: Date): number {
  let n = 0;
  for (const b of bookings) {
    if (b.startTime < end && b.endTime > start) n++;
  }
  return n;
}

/**
 * Pick the best resource among candidates that can take the slot.
 * Rules: preferred id wins if it can take the slot; otherwise the least loaded
 * candidate (fewest overlapping active bookings) is chosen to balance wear.
 * Returns null when no candidate can take the slot.
 */
export function pickFreeResource(
  candidates: ResourceLike[],
  getOverlaps: (resource: ResourceLike) => OverlappingBooking[],
  slotStart: Date,
  slotEnd: Date,
  timezone: string,
  preferredId?: string | null
): ResourceLike | null {
  const can = (r: ResourceLike) => resourceCanTakeSlot(r, slotStart, slotEnd, timezone, getOverlaps(r));

  if (preferredId) {
    const pref = candidates.find((r) => r.id === preferredId);
    if (pref && can(pref)) return pref;
  }

  const free = candidates.filter(can);
  if (free.length === 0) return null;

  // Least loaded first (balance wear across chairs/machines), then insertion order.
  return [...free].sort((a, b) => {
    const na = countOverlaps(getOverlaps(a), slotStart, slotEnd);
    const nb = countOverlaps(getOverlaps(b), slotStart, slotEnd);
    return na - nb;
  })[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// Composition with the booking-page schedule (used by check-availability, the
// booking POST and reschedule). These helpers keep the page schedule as the
// base: a resource with NO rules of its own inherits the page's open windows;
// a resource WITH rules substitutes them (its windows, minus closed blocks).
// ─────────────────────────────────────────────────────────────────────────────

export interface OpenWindow {
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export interface ResourceWithLocation extends ResourceLike {
  name: string; // display name, e.g. "Sillón 2"
  location?: { id: string; name: string | null; address: string | null } | null;
}

/** Day-of-week + minutes of a Date, naively (server-local), matching how the
 *  check-availability route derives the weekday of the requested calendar date. */
export function naiveSlotParts(d: Date): { dayOfWeek: number; minutes: number } {
  return { dayOfWeek: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
}

/** True when [startMin, endMin) fits inside at least one open window. */
export function isInsideOpenWindows(windows: OpenWindow[], startMin: number, endMin: number): boolean {
  for (const w of windows) {
    const { startMin: ws, endMin: we } = intervalToMinutes(w.startTime, w.endTime);
    if (ws < 0 || we < 0) continue;
    if (startMin >= ws && endMin <= we) return true;
  }
  return false;
}

/**
 * Effective verdict combining a resource's own schedule with the page schedule:
 *   - resource without rules → inherit the page's open windows for that day
 *     ('open' iff the slot fits one of them, otherwise 'closed');
 *   - resource with rules    → its own schedule substitutes (resourceVerdict).
 */
export function effectiveVerdict(
  resource: Pick<ResourceLike, 'availabilities'>,
  pageOpenWindowsForDay: OpenWindow[],
  dayOfWeek: number,
  slotStartMin: number,
  slotEndMin: number
): SlotVerdict {
  if (resource.availabilities.length === 0) {
    return isInsideOpenWindows(pageOpenWindowsForDay, slotStartMin, slotEndMin) ? 'open' : 'closed';
  }
  return resourceVerdict(resource, dayOfWeek, slotStartMin, slotEndMin);
}

/**
 * True when a resource can take the slot: active, open per effective verdict
 * (own rules substitute; no rules inherit the page windows) and fewer than
 * `capacity` active bookings overlap the real slot span.
 */
export function resourceCanTakeSlotAt(
  resource: ResourceWithLocation,
  pageOpenWindowsForDay: OpenWindow[],
  dayOfWeek: number,
  slotStartMin: number,
  slotEndMin: number,
  activeOverlaps: OverlappingBooking[],
  slotStart: Date,
  slotEnd: Date
): boolean {
  if (!resource.isActive) return false;
  const v = effectiveVerdict(resource, pageOpenWindowsForDay, dayOfWeek, slotStartMin, slotEndMin);
  if (v === 'closed') return false;
  return countOverlaps(activeOverlaps, slotStart, slotEnd) < Math.max(1, resource.capacity);
}

/**
 * Build the sorted, deduped candidate slot times ("HH:MM") for a day, as the
 * union of the page's open windows and every active resource's own open
 * windows. Used by the availability check when the event type allows
 * resources; the per-resource verdict then decides each candidate.
 */
export function buildDayCandidates(
  pageOpenWindows: OpenWindow[],
  resources: Array<Pick<ResourceLike, 'availabilities' | 'isActive'>>,
  dayOfWeek: number,
  slotInterval: number
): string[] {
  const sources: OpenWindow[] = [...pageOpenWindows];
  for (const r of resources) {
    if (!r.isActive) continue;
    if (r.availabilities.length === 0) continue; // inherits page → page windows already added
    sources.push(...r.availabilities.filter((a) => a.dayOfWeek === dayOfWeek && a.isAvailable));
  }
  const out = new Set<string>();
  for (const w of sources) {
    const { startMin, endMin } = intervalToMinutes(w.startTime, w.endTime);
    if (startMin < 0 || endMin < 0 || endMin <= startMin) continue;
    for (let m = startMin; m < endMin && m < 24 * 60; m += slotInterval) {
      out.add(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
  }
  return [...out].sort();
}

/**
 * For every candidate slot of the day, decide whether at least one allowed
 * resource is free and (when it is) which resource would serve it.
 *
 * Returns the list of bookable slot times, each with the least-loaded free
 * resource id (preferredId wins when it is free). Callers keep applying
 * non-resource filters (time off, past slots, calendar events, page-level
 * conflicts for events without resources) around this.
 */
export function chooseResourcePerSlot(opts: {
  candidates: string[]; // sorted "HH:MM"
  dayOfWeek: number;
  pageOpenWindows: OpenWindow[];
  resources: ResourceWithLocation[]; // allowed, already filtered to active
  durationMinutes: number;
  bufferMinutes?: number;
  slotDateFor: (time: string) => Date; // naive start Date of a candidate slot
  bookingsByResource: Map<string, OverlappingBooking[]>; // key = resource.id
  legacyOverlaps?: OverlappingBooking[]; // pre-resource bookings on the same event type (block every resource)
  preferredId?: string | null;
}): { time: string; resourceId: string | null }[] {
  const {
    candidates,
    dayOfWeek,
    pageOpenWindows,
    resources,
    durationMinutes,
    bufferMinutes = 0,
    slotDateFor,
    bookingsByResource,
    legacyOverlaps = [],
    preferredId,
  } = opts;
  const out: { time: string; resourceId: string | null }[] = [];

  for (const time of candidates) {
    const start = slotDateFor(time);
    const end = addDateMinutes(start, durationMinutes + bufferMinutes);
    const { minutes: startMin } = naiveSlotParts(start);
    const { minutes: endMin } = naiveSlotParts(end);

    // Legacy bookings (booked before resources existed) block every resource.
    const blockers = legacyOverlaps;
    const freeResources: { r: ResourceWithLocation; overlaps: number }[] = [];

    for (const r of resources) {
      const overlaps = [...(bookingsByResource.get(r.id) ?? []), ...blockers];
      if (!resourceCanTakeSlotAt(r, pageOpenWindows, dayOfWeek, startMin, endMin, overlaps, start, end)) {
        continue;
      }
      freeResources.push({ r, overlaps: countOverlaps(bookingsByResource.get(r.id) ?? [], start, end) });
    }

    if (freeResources.length === 0) continue;

    // preferred wins when free; otherwise least loaded (then declaration order).
    const preferred = preferredId ? freeResources.find((f) => f.r.id === preferredId) : undefined;
    const chosen = preferred ?? freeResources.sort((a, b) => a.overlaps - b.overlaps)[0];
    out.push({ time, resourceId: chosen.r.id });
  }

  return out;
}

/** date + minutes (naive; avoids Date mutation surprises). */
function addDateMinutes(d: Date, minutes: number): Date {
  const out = new Date(d);
  out.setMinutes(out.getMinutes() + minutes);
  return out;
}
