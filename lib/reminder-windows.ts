/**
 * Reminder scheduling for booking notifications (email + WhatsApp).
 *
 * Pure functions — no DB, no network — so cron routes and tests share the
 * same window math. All windows are generous (±60 min) because Vercel cron
 * fires hourly and can jitter; deduplication is handled by per-booking flags,
 * not by tight windows.
 */

/** Slack on each side of a target point in minutes. */
export const REMINDER_WINDOW_MINUTES = 60;

/** Minutes of tolerance after the start time for last-chance reminders. */
export const REMINDER_PAST_GRACE_MINUTES = 10;

export interface ReminderWindow {
  /** Booking start times at or after this instant may receive the reminder. */
  from: Date;
  /** Booking start times at or before this instant may receive the reminder. */
  to: Date;
}

/** Window [T−24h−60m, T−24h+60m] for day-before reminders. */
export function window24h(now: Date): ReminderWindow {
  const from = new Date(now.getTime() + (24 * 60 - REMINDER_WINDOW_MINUTES) * 60_000);
  const to = new Date(now.getTime() + (24 * 60 + REMINDER_WINDOW_MINUTES) * 60_000);
  return { from, to };
}

/**
 * Window [T−60m, T+10m] for last-chance reminders. The past grace lets the
 * hourly cron still catch a booking that started minutes ago (e.g. if the
 * previous run failed), instead of dropping it forever.
 */
export function window1h(now: Date): ReminderWindow {
  const from = new Date(now.getTime() - REMINDER_PAST_GRACE_MINUTES * 60_000);
  const to = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60_000);
  return { from, to };
}
