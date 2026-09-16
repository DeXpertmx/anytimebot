/**
 * Reminder scheduling for booking notifications (email + WhatsApp).
 *
 * Pure functions — no DB, no network — so cron routes and tests share the
 * same window math. Deduplication is handled by per-booking flags
 * (`reminder24hSent` / `reminder1hSent`), not by tight windows.
 *
 * Cadence note: Vercel's Hobby plan only allows DAILY cron schedules. With a
 * daily run, a fixed "±1h around T−24h" window would miss almost every
 * booking (only those starting ±1h of the run's clock time would be caught).
 * The daily sweep below fixes that: a 24h-wide window that advances one day
 * per run, so EVERY booking is caught by exactly one run and receives its
 * reminder 12–36h before the start. If the account upgrades to Pro, the
 * hourly windows (`window24h`, `window1h`) tighten notifications back to
 * their nominal times with an hourly schedule.
 */

/** Slack on each side of a target point in minutes (hourly cadence). */
export const REMINDER_WINDOW_MINUTES = 60;

/** Minutes of tolerance after the start time for last-chance reminders. */
export const REMINDER_PAST_GRACE_MINUTES = 10;

/** Daily sweep: earliest reminder, hours before the booking starts. */
export const DAILY_SWEEP_MIN_HOURS = 12;

/** Daily sweep: latest reminder, hours before the booking starts. */
export const DAILY_SWEEP_MAX_HOURS = 36;

export interface ReminderWindow {
  /** Booking start times at or after this instant may receive the reminder. */
  from: Date;
  /** Booking start times at or before this instant may receive the reminder. */
  to: Date;
}

/**
 * DAILY cadence: window [now+12h, now+36h]. Consecutive daily runs tile the
 * timeline (run N covers 12–36h ahead, run N+1 covers 36–60h ahead), so every
 * booking is reminded exactly once, 12–36 hours before it starts, regardless
 * of its time of day. Boundary overlaps are resolved by the dedup flags.
 */
export function window24hDaily(now: Date): ReminderWindow {
  const from = new Date(now.getTime() + DAILY_SWEEP_MIN_HOURS * 3_600_000);
  const to = new Date(now.getTime() + DAILY_SWEEP_MAX_HOURS * 3_600_000);
  return { from, to };
}

/** HOURLY cadence: window [T−24h−60m, T−24h+60m] for day-before reminders. */
export function window24h(now: Date): ReminderWindow {
  const from = new Date(now.getTime() + (24 * 60 - REMINDER_WINDOW_MINUTES) * 60_000);
  const to = new Date(now.getTime() + (24 * 60 + REMINDER_WINDOW_MINUTES) * 60_000);
  return { from, to };
}

/**
 * HOURLY cadence: window [T−60m, T+10m] for last-chance reminders. The past
 * grace lets a run still catch a booking that started minutes ago (e.g. if
 * the previous run failed), instead of dropping it forever.
 */
export function window1h(now: Date): ReminderWindow {
  const from = new Date(now.getTime() - REMINDER_PAST_GRACE_MINUTES * 60_000);
  const to = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60_000);
  return { from, to };
}
