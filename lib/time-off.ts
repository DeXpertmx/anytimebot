/**
 * Helpers for time-off blocks (absences).
 *
 * Blocks come in two shapes, both stored as a start/end instant range:
 *  - whole days: the API snaps them to `00:00:00.000Z` → `23:59:59.999Z`
 *    (see app/api/time-off/route.ts);
 *  - time ranges: a partial hour block ("lunch break"), stored as the exact
 *    instants the client picked, so local hours are preserved.
 *
 * Pure helpers shared by the dashboard UI and the calendar.
 */

export interface TimeOffLike {
  start: string | Date;
  end: string | Date;
  /** Explicit flag stored since the partial-hour blocks shipped. */
  allDay?: boolean | null;
}

/**
 * True when the block was created as a whole-day absence.
 *
 * The `allDay` flag is authoritative; only rows created before it existed (or
 * payloads without it) fall back to sniffing the stored UTC day bounds.
 */
export function isWholeDayBlock(block: TimeOffLike): boolean {
  if (block.allDay === false) return false;
  if (block.allDay === true) return true;

  const start = new Date(block.start);
  const end = new Date(block.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return (
    start.getUTCHours() === 0 &&
    start.getUTCMinutes() === 0 &&
    start.getUTCSeconds() === 0 &&
    end.getUTCHours() === 23 &&
    end.getUTCMinutes() === 59
  );
}

/** `HH:MM` of a timestamp in the viewer's local time. */
export function blockClockTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** `20 sep 2026` (local date). */
export function blockDayLabel(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Human window for a block: `20 sep 2026` for whole days,
 * `20 sep 2026 · 14:00–16:00` for partial ones.
 */
export function formatBlockWindow(block: TimeOffLike): string {
  if (isWholeDayBlock(block)) {
    const start = blockDayLabel(block.start);
    const end = blockDayLabel(block.end);
    return start === end ? start : `${start} – ${end}`;
  }
  return `${blockDayLabel(block.start)} · ${blockClockTime(block.start)}–${blockClockTime(block.end)}`;
}

/** Do two instant ranges overlap? (Half-open: touching edges do not count.) */
export function rangesOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date }
): boolean {
  return a.start < b.end && a.end > b.start;
}

export type BlockRange = { start: Date; end: Date; partial: boolean };

export type BlockRangeResult =
  | { ok: true; range: BlockRange }
  | { ok: false; error: string };

const DAY_START = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize the payload of POST /api/time-off into a stored instant range.
 *
 * - `YYYY-MM-DD` dates are snapped to the UTC day bounds used since the
 *   original absence feature (API/integration callers).
 * - ISO datetimes with offset (what the dashboard sends) are stored as-is, so
 *   the blocked window is the one the owner actually picked in their own
 *   timezone instead of being read as server-local time.
 *
 * `allDay === false` marks a partial-hour block (a lunch break); those only
 * accept ISO datetimes, since a bare date would have no meaningful hour.
 */
export function resolveBlockRange(input: {
  start?: unknown;
  end?: unknown;
  allDay?: unknown;
}): BlockRangeResult {
  const partial = input.allDay === false;

  const parse = (value: unknown, bounds: 'start' | 'end'): Date | null => {
    if (typeof value !== 'string' || !value) return null;
    if (DAY_START.test(value)) {
      if (partial) return null; // an hour is required for a time range
      return new Date(`${value}T${bounds === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`);
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const start = parse(input.start, 'start');
  const end = parse(input.end, 'end');

  if (!start || !end) {
    return {
      ok: false,
      error: partial
        ? 'Start and end (ISO datetimes) are required for a time range'
        : 'Start and end dates (YYYY-MM-DD) are required',
    };
  }

  // Every block needs a positive duration. A whole-day block sent as bare
  // dates may start and end on the same day (a single day off); its ISO form
  // already spans 00:00 → 23:59:59.999, so the strict check holds there too.
  const dateOnly =
    !partial &&
    typeof input.start === 'string' &&
    typeof input.end === 'string' &&
    DAY_START.test(input.start) &&
    DAY_START.test(input.end);

  const invalid = dateOnly
    ? String(input.start) > String(input.end)
    : end.getTime() <= start.getTime();

  if (invalid) {
    return {
      ok: false,
      error: partial
        ? 'The end time must be after the start time'
        : 'End date must be on or after start date',
    };
  }

  return { ok: true, range: { start, end, partial } };
}
