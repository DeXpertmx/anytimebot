/**
 * Availability engine (Phase B — "sedes con huso propio").
 *
 * Pure, dependency-free slot generation that is explicit about TIMEZONES:
 *
 *   • Availability windows (booking page and per-resource schedules) are
 *     wall-clock rules expressed in the timezone where they were defined
 *     (the sede's `Location.timezone`, or the owner's timezone otherwise).
 *   • Slots are computed as REAL instants (UTC) with Intl/DST-safe math.
 *   • The day the guest picks is a full calendar day in the GUEST's own
 *     timezone, so a Madrid host and a Mexico City guest share one truth.
 *   • Resulting slot strings are rendered in a chosen display timezone.
 *
 * When no sede/guest timezone info is available the engine degrades to
 * anchor = 'UTC', which reproduces the legacy naive behaviour of the app.
 *
 * These helpers are pure on purpose (like lib/resources.ts): callers inject
 * prisma results, so the engine is fully unit-testable without a database.
 */

import {
  timeToMinutes,
  localSlotParts,
  resourceVerdict,
  countOverlaps,
  type AvailabilityRule,
  type OverlappingBooking,
} from '@/lib/resources';

// ─────────────────────────────────────────────────────────────────────────────
// IANA-safe wall-clock <-> instant helpers (Intl based, DST aware)
// ─────────────────────────────────────────────────────────────────────────────

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  minutes: number; // minutes since midnight
}

/** Wall-clock components (calendar date + minutes) of an instant in `timezone`. */
export function wallClockOf(instant: Date, timezone: string): WallClock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(instant);
  const byType = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    year: Number(byType.year ?? '1970'),
    month: Number(byType.month ?? '01'),
    day: Number(byType.day ?? '01'),
    minutes: Number(byType.hour ?? '0') * 60 + Number(byType.minute ?? '0'),
  };
}

/** "HH:MM" wall-clock minutes, zero-padded (e.g. 540 → "09:00"). */
export function minutesToHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "HH:MM" wall-clock time of an instant in `timezone`. */
export function formatTimeInTz(instant: Date, timezone: string): string {
  return minutesToHhmm(wallClockOf(instant, timezone).minutes);
}

/**
 * The instant at which the wall-clock time `hhmm` on the calendar date
 * `dateStr` (YYYY-MM-DD) happens in `timezone`. Converges by offset diffing,
 * which is DST-safe (a non-existent wall time, e.g. 02:30 during a spring
 * forward, resolves to a nearby real instant instead of throwing).
 */
export function wallClockToInstant(dateStr: string, hhmm: string, timezone: string): Date {
  const t = timeToMinutes(hhmm);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m || t < 0) {
    return new Date(NaN);
  }
  const targetUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + t * 60_000;
  let ms = targetUtc;
  for (let i = 0; i < 4; i++) {
    const wall = wallClockOf(new Date(ms), timezone);
    const wallUtc = Date.UTC(wall.year, wall.month - 1, wall.day) + wall.minutes * 60_000;
    const delta = targetUtc - wallUtc;
    if (delta === 0) break;
    ms += delta;
  }
  return new Date(ms);
}

/** Shift a YYYY-MM-DD string by whole days (UTC arithmetic — no DST drift). */
export function shiftYmd(dateStr: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return dateStr;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** Calendar day (YYYY-MM-DD) of an instant in `timezone`. */
export function ymdOf(instant: Date, timezone: string): string {
  const w = wallClockOf(instant, timezone);
  return `${String(w.year).padStart(4, '0')}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
}

/** [start, end) instant span of the whole calendar day `dateStr` in `timezone`. */
export function daySpanInTz(dateStr: string, timezone: string): { start: Date; end: Date } {
  const start = wallClockToInstant(dateStr, '00:00', timezone);
  const end = new Date(start.getTime() + 24 * 60 * 60_000);
  return { start, end };
}

/** Weekday (0=Sunday) of the calendar day `dateStr` in `timezone`. */
export function weekdayOfYmd(dateStr: string, timezone: string): number {
  // 12:00 local avoids any DST boundary ambiguity.
  return localSlotParts(wallClockToInstant(dateStr, '12:00', timezone), timezone).dayOfWeek;
}

/**
 * Anchor-local calendar dates whose full days intersect [rangeStart, rangeEnd).
 * At most 2 for real timezones, but the loop is bounded anyway.
 */
export function overlappingAnchorDates(
  rangeStart: Date,
  rangeEnd: Date,
  anchorTz: string
): string[] {
  const out: string[] = [];
  let date = ymdOf(rangeStart, anchorTz);
  for (let i = 0; i < 4; i++) {
    const span = daySpanInTz(date, anchorTz);
    if (span.start.getTime() >= rangeEnd.getTime()) break;
    if (span.end.getTime() > rangeStart.getTime()) out.push(date);
    if (span.end.getTime() >= rangeEnd.getTime()) break;
    date = shiftYmd(date, 1);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Window model + slot instant generation
// ─────────────────────────────────────────────────────────────────────────────

/** One open window of a weekday ("HH:MM", end exclusive on the minute grid). */
export interface DayWindow {
  dayOfWeek: number; // 0 = Sunday … 6 = Saturday
  startTime: string;
  endTime: string;
}

/** A set of weekday windows expressed in one timezone. */
export interface TzWindowSource {
  timezone: string;
  windows: DayWindow[];
}

/**
 * Candidate slot instants (sorted, deduped) produced by one or more window
 * sources whose wall-clock rules live in possibly different timezones
 * (page schedule + each sede's resources), intersected with the guest's
 * requested calendar day [rangeStart, rangeEnd).
 */
export function generateCandidateInstants(
  sources: TzWindowSource[],
  rangeStart: Date,
  rangeEnd: Date,
  slotInterval: number
): Date[] {
  const seen = new Set<number>();
  const out: Date[] = [];
  for (const source of sources) {
    const anchorDates = overlappingAnchorDates(rangeStart, rangeEnd, source.timezone);
    for (const dateStr of anchorDates) {
      const dow = weekdayOfYmd(dateStr, source.timezone);
      for (const window of source.windows) {
        if (window.dayOfWeek !== dow) continue;
        const startMin = timeToMinutes(window.startTime);
        const endMin = timeToMinutes(window.endTime);
        if (startMin < 0 || endMin < 0 || endMin <= startMin) continue;
        for (let m = startMin; m < endMin && m < 24 * 60; m += slotInterval) {
          const instant = wallClockToInstant(dateStr, minutesToHhmm(m), source.timezone);
          const ms = instant.getTime();
          if (!Number.isNaN(ms) && ms >= rangeStart.getTime() && ms < rangeEnd.getTime() && !seen.has(ms)) {
            seen.add(ms);
            out.push(instant);
          }
        }
      }
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** True when [startMin, endMin) fits inside one of the open windows of `dayOfWeek`. */
export function isInsideDayWindows(
  windows: DayWindow[],
  dayOfWeek: number,
  startMin: number,
  endMin: number
): boolean {
  for (const w of windows) {
    if (w.dayOfWeek !== dayOfWeek) continue;
    const start = timeToMinutes(w.startTime);
    const end = timeToMinutes(w.endTime);
    if (start < 0 || end < 0) continue;
    if (startMin >= start && endMin <= end) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-slot verdicts (schedule + capacity + per-resource closures)
// ─────────────────────────────────────────────────────────────────────────────

export interface EngineResource {
  id: string;
  name: string;
  capacity: number;
  isActive: boolean;
  /** Timezone its own `rules` are expressed in (sede timezone). */
  timezone?: string | null;
  /** Own schedule rules (empty = inherit the page schedule in the page tz). */
  rules: AvailabilityRule[];
  /** True when a per-resource time off covers this slot's day. */
  blockedToday?: boolean;
}

export interface DayOffer {
  instant: Date;
  time: string; // rendered in `displayTz`
  resourceId: string | null; // null = classic (no resources)
}

export interface ComputeDayOffersOptions {
  /** Guest-selected calendar day (in the guest's own timezone). */
  guestDate: string;
  /** Timezone the guest lives in. */
  guestTz: string;
  /** Timezone the page/user schedules are expressed in. */
  anchorTz: string;
  /** Timezone used to render the returned slot strings. */
  displayTz: string;
  /** All open windows of the booking page (weekday rules, in anchorTz). */
  pageOpenWindows: DayWindow[];
  /** Allowed active resources ([] = classic mode). */
  resources: EngineResource[];
  slotInterval: number;
  durationMinutes: number;
  bufferMinutes?: number;
  legacyOverlaps?: OverlappingBooking[];
  overlapsByResource: Map<string, OverlappingBooking[]>;
  preferredResourceId?: string | null;
}

/**
 * Core Phase-B algorithm. Returns the bookable slots of the guest's day as
 * real instants plus the string shown to the guest (`displayTz`), and — in
 * resource mode — which resource would serve each slot. Callers still apply
 * non-schedule filters (bookings of the same event type without resources,
 * calendar events, past slots, owner-wide time off).
 */
export function computeDayOffers(opts: ComputeDayOffersOptions): DayOffer[] {
  const {
    guestDate,
    guestTz,
    anchorTz,
    displayTz,
    pageOpenWindows,
    resources,
    slotInterval,
    durationMinutes,
    bufferMinutes = 0,
    legacyOverlaps = [],
    overlapsByResource,
    preferredResourceId,
  } = opts;

  const active = resources.filter((r) => r.isActive);
  const range = daySpanInTz(guestDate, guestTz);

  // Sources of candidate times: the page schedule (page tz) plus each
  // resource's own open windows (its sede timezone). A resource without own
  // rules adds no source — it inherits the page schedule.
  const sources: TzWindowSource[] = [{ timezone: anchorTz, windows: pageOpenWindows }];
  for (const r of active) {
    if (r.blockedToday) continue;
    const ownWindows = r.rules.filter((a) => a.isAvailable).map((a) => ({
      dayOfWeek: a.dayOfWeek,
      startTime: a.startTime,
      endTime: a.endTime,
    }));
    if (ownWindows.length === 0) continue;
    sources.push({ timezone: r.timezone || anchorTz, windows: ownWindows });
  }

  const candidates = generateCandidateInstants(sources, range.start, range.end, slotInterval);
  const out: DayOffer[] = [];

  for (const instant of candidates) {
    const end = new Date(instant.getTime() + (durationMinutes + bufferMinutes) * 60_000);

    // Classic mode: page schedule is the only constraint (booking conflicts,
    // calendar events and past slots are applied by the caller afterwards).
    if (active.length === 0) {
      const sp = localSlotParts(instant, anchorTz);
      const ep = localSlotParts(end, anchorTz);
      if (!isInsideDayWindows(pageOpenWindows, sp.dayOfWeek, sp.minutes, ep.minutes)) continue;
      out.push({ instant, time: formatTimeInTz(instant, displayTz), resourceId: null });
      continue;
    }

    // Resource mode: pick the least-loaded free resource for this instant.
    const free: { r: EngineResource; load: number }[] = [];
    for (const r of active) {
      if (r.blockedToday) continue;
      let open: boolean;
      if (r.rules.length === 0) {
        // Inherit the page schedule — windows evaluated in the page timezone.
        const sp = localSlotParts(instant, anchorTz);
        const ep = localSlotParts(end, anchorTz);
        open = isInsideDayWindows(pageOpenWindows, sp.dayOfWeek, sp.minutes, ep.minutes);
      } else {
        // Own rules substitute the page schedule, in the resource's own tz.
        const sp = localSlotParts(instant, r.timezone || anchorTz);
        const ep = localSlotParts(end, r.timezone || anchorTz);
        open =
          resourceVerdict({ availabilities: r.rules }, sp.dayOfWeek, sp.minutes, ep.minutes) ===
          'open';
      }
      if (!open) continue;
      const blockers = [...(overlapsByResource.get(r.id) ?? []), ...legacyOverlaps];
      if (countOverlaps(blockers, instant, end) >= Math.max(1, r.capacity)) continue;
      free.push({
        r,
        load: countOverlaps(overlapsByResource.get(r.id) ?? [], instant, end),
      });
    }

    if (free.length === 0) continue;

    const preferred = preferredResourceId ? free.find((f) => f.r.id === preferredResourceId) : undefined;
    const chosen = preferred ?? free.sort((a, b) => a.load - b.load)[0];
    out.push({ instant, time: formatTimeInTz(instant, displayTz), resourceId: chosen.r.id });
  }

  return out;
}

/** True when a [start, end) instant span intersects a TimeOff day range. */
export function instantOverlapsRange(timeOffStart: Date, timeOffEnd: Date, start: Date, end: Date): boolean {
  return timeOffStart.getTime() < end.getTime() && timeOffEnd.getTime() > start.getTime();
}
