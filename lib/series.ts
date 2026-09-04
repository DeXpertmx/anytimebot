/**
 * Recurring appointment series: expansion of a recurrence rule into concrete
 * occurrence start times.
 *
 * DST safety: day-of-week recurrence repeats a *local wall-clock time*, so we
 * never add n*7*24h milliseconds. Instead we shift the date part by n*7 days
 * (or n*2 for biweekly) and keep the local time part — which is how calendars
 * and humans expect it to behave when DST starts or ends mid-series.
 *
 * Dependency injection (now, addDaysLike) keeps this pure and testable, same
 * pattern as lib/webhooks.ts and lib/whatsapp-manager.ts.
 */

export interface RecurrenceRule {
  /** Weekly or every two weeks */
  freq: 'WEEKLY' | 'BIWEEKLY';
  /** Local wall-clock time, 'HH:mm' */
  time: string;
  /** Weekday the series anchors to: 0=Sunday … 6=Saturday */
  byWeekday: number;
  /** Total occurrences including the first one (1–52) */
  count: number;
}

export const MAX_SERIES_OCCURRENCES = 52;
export const MAX_SERIES_HORIZON_DAYS = 730;

export function parseRecurrence(value: unknown): RecurrenceRule | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const freq = r.freq === 'BIWEEKLY' ? 'BIWEEKLY' : r.freq === 'WEEKLY' ? 'WEEKLY' : null;
  const time = typeof r.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : null;
  const byWeekday = Number.isInteger(r.byWeekday) && (r.byWeekday as number) >= 0 && (r.byWeekday as number) <= 6 ? (r.byWeekday as number) : null;
  const count = Number.isInteger(r.count) && (r.count as number) >= 1 && (r.count as number) <= MAX_SERIES_OCCURRENCES ? (r.count as number) : null;
  if (!freq || !time || byWeekday === null || count === null) return null;
  return { freq, time, byWeekday, count };
}

export function isValidRule(value: unknown): value is RecurrenceRule {
  return parseRecurrence(value) !== null;
}

/**
 * Build a Date with the same local Y/M/D as `like` plus the H:m:s of `time`.
 * A Date carrying a local wall-clock (e.g. `2026-09-07T10:00` on the host) is
 * ambiguous server-side; the PUBLIC PAGE constructs these and sends ISO
 * strings interpreted as local-on-host — same convention as single bookings.
 */
export function atLocalTime(like: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number);
  return new Date(like.getFullYear(), like.getMonth(), like.getDate(), h, m, 0, 0);
}

/**
 * Shift a Date by n calendar days preserving its local wall clock
 * (Date arithmetic handles DST on day boundaries).
 */
export function addDaysLike(like: Date, days: number): Date {
  return new Date(like.getFullYear(), like.getMonth(), like.getDate() + days, like.getHours(), like.getMinutes(), 0, 0);
}

/** 0=Sunday … 6=Saturday */
export function weekdayOf(d: Date): number {
  return d.getDay();
}

/**
 * Expand a rule into concrete start Dates (UTC instants).
 * - If `firstStart` is provided it is used verbatim as occurrence #1.
 * - Otherwise the first occurrence is the next date matching `byWeekday`
 *   at `time` (today included), computed with `now`.
 */
export function expandRecurrence(
  rule: RecurrenceRule,
  options: { firstStart?: Date; now?: Date } = {}
): Date[] {
  const { firstStart, now = new Date() } = options;
  const stepDays = rule.freq === 'BIWEEKLY' ? 14 : 7;
  const out: Date[] = [];

  if (firstStart) {
    out.push(firstStart);
    let cursor = firstStart;
    for (let i = 1; i < rule.count; i++) {
      cursor = addDaysLike(cursor, stepDays);
      out.push(atLocalTime(cursor, rule.time));
    }
    return out;
  }

  // Find the first matching weekday at the rule's local time.
  const base = atLocalTime(new Date(now.getFullYear(), now.getMonth(), now.getDate()), rule.time);
  let first = base;
  let guard = 0;
  while (weekdayOf(first) !== rule.byWeekday && guard < 8) {
    first = addDaysLike(first, 1);
    guard++;
  }
  if (guard >= 8) return out;

  for (let i = 0; i < rule.count; i++) {
    out.push(addDaysLike(first, i * stepDays));
  }
  return out;
}

/** Human-readable summary, e.g. "Cada semana · lunes, 10:00 · 8 citas" (Spanish UI supplies labels). */
export function describeRecurrence(rule: RecurrenceRule, locale: 'es' | 'en'): string {
  const weekdays = locale === 'es'
    ? ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
    : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const every = locale === 'es'
    ? (rule.freq === 'BIWEEKLY' ? 'Cada 2 semanas' : 'Cada semana')
    : (rule.freq === 'BIWEEKLY' ? 'Every 2 weeks' : 'Weekly');
  const times = locale === 'es'
    ? (rule.count === 1 ? '1 cita' : `${rule.count} citas`)
    : (rule.count === 1 ? '1 appointment' : `${rule.count} appointments`);
  return `${every} · ${weekdays[rule.byWeekday]}, ${rule.time} · ${times}`;
}
