/**
 * Google Calendar sync repair (lib/gcal-repair.ts).
 *
 * One owner at a time: compares the owner's active bookings against the
 * events that actually exist in their Google Calendar and fixes the three
 * drift classes (see repairOwnerCalendar). Pure, dependency-injected core
 * (prisma + calendar ops) so node:test can drive it without network or DB.
 *
 * Executed daily by /api/cron/repair-gcal-sync (see vercel.json), which is
 * how Vercel Hobby deployments run it; the same lib is exported here so the
 * cron route stays a thin auth+logging wrapper.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from './db';
import {
  listCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from './google-calendar';
import { buildCalendarDescription } from './calendar-description';
import { bookingVenueText } from './booking-venue';
import { describeRecurrence, type RecurrenceRule } from './series';

/** How far ahead the daily repair looks for active bookings (days). */
export const REPAIR_HORIZON_DAYS = 60;
/** How far back past bookings are still reconciled (days). */
export const REPAIR_PAST_DAYS = 30;

/** Bookings that must have a live Google Calendar event. */
export const ACTIVE_STATUSES = ['CONFIRMED', 'PENDING'] as const;

export interface RepairBooking {
  id: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  startTime: Date;
  endTime: Date;
  status: string;
  meetingUrl: string | null;
  resourceName: string | null;
  locationName: string | null;
  locationAddress: string | null;
  googleCalendarEventId: string | null;
  seriesId: string | null;
  series?: { recurrence: unknown } | null;
  eventType: {
    name: string;
    videoProvider: string;
    videoLink: string | null;
  };
}

export interface RepairOwnerDeps {
  prisma: Pick<PrismaClient, 'user' | 'booking' | 'systemSetting'>;
  calendar: {
    list: typeof listCalendarEvents;
    create: typeof createCalendarEvent;
    del: typeof deleteCalendarEvent;
    update: typeof updateCalendarEvent;
  };
  now?: Date;
}

export interface OwnerRepairResult {
  userId: string;
  checked: number;
  created: number;
  updated: number;
  deleted: number;
  relinked: number;
  errors: number;
}

const MANUAL_PROVIDER_LABELS: Record<string, string> = {
  GOOGLE_MEET: 'Google Meet',
  ZOOM: 'Zoom',
  TEAMS: 'Microsoft Teams',
  DAILY: 'Video room',
  CUSTOM: 'Reunión',
};

function expectedDescription(b: RepairBooking): string {
  return buildCalendarDescription({
    guestName: b.guestName,
    guestEmail: b.guestEmail,
    guestPhone: b.guestPhone,
    meetingUrl:
      b.seriesId && b.meetingUrl
        ? b.meetingUrl
        : b.eventType.videoProvider !== 'DAILY'
          ? b.meetingUrl || b.eventType.videoLink
          : b.meetingUrl,
    meetingProvider: MANUAL_PROVIDER_LABELS[b.eventType.videoProvider] ?? null,
    venue: bookingVenueText(b) ?? null,
  });
}

function seriesSummary(b: RepairBooking): string | null {
  if (!b.seriesId || !b.series?.recurrence) return null;
  try {
    return describeRecurrence(b.series.recurrence as RecurrenceRule, 'es');
  } catch {
    return null;
  }
}

/**
 * Repairs one owner's calendar sync. Drift classes fixed:
 *
 *  1. MISSING    — active booking with no live Google event → creates it.
 *  2. STALE LINK — active booking whose eventId points to a deleted event
 *                  (or to another owner's/booking's event) → creates a
 *                  fresh event and relinks the booking.
 *  3. WRONG TIME — active booking whose event exists but starts/ends at a
 *                  different instant (e.g. rescheduled outside our code
 *                  paths) → moves the event to the booking's window.
 *  4. STALE EVENTS — CONFIRMED bookings that got soft-deleted (host removed
 *                  them from the dashboard) still have events → deletes them.
 *
 * Recurring series: only the first occurrence is repaired — the series
 * endpoints recreate all occurrences when the rule changes, so per-
 * occurrence repairs would fight them.
 */
/**
 * Production entry point: repairOwnerCalendar with the real prisma client and
 * real calendar operations injected. Cron routes call this; tests inject fakes.
 */
export async function repairOwnerCalendarLive(userId: string): Promise<OwnerRepairResult> {
  return repairOwnerCalendar(userId, {
    prisma,
    calendar: {
      list: listCalendarEvents,
      create: createCalendarEvent,
      del: deleteCalendarEvent,
      update: updateCalendarEvent,
    },
  });
}

export async function repairOwnerCalendar(userId: string, deps: RepairOwnerDeps): Promise<OwnerRepairResult> {
  const now = deps.now ?? new Date();
  const windowStart = new Date(now.getTime() - REPAIR_PAST_DAYS * 86_400_000);
  const windowEnd = new Date(now.getTime() + REPAIR_HORIZON_DAYS * 86_400_000);

  const result: OwnerRepairResult = { userId, checked: 0, created: 0, updated: 0, deleted: 0, relinked: 0, errors: 0 };

  const owner = await deps.prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, calendarSyncEnabled: true, accounts: { where: { provider: 'google' }, select: { id: true } } },
  });
  // No Google account or sync disabled → nothing to repair for this owner.
  if (!owner?.calendarSyncEnabled || owner.accounts.length === 0) return result;

  // All bookings in the reconciliation window (active + cancelled), with series data.
  const bookings = (await deps.prisma.booking.findMany({
    where: {
      startTime: { gte: windowStart, lte: windowEnd },
      eventType: { bookingPage: { userId } },
    },
    include: {
      series: { select: { recurrence: true } },
      eventType: { select: { name: true, videoProvider: true, videoLink: true } },
    },
  })) as unknown as RepairBooking[];
  result.checked = bookings.length;
  if (bookings.length === 0) return result;

  // The events Google actually has in that window.
  let gEvents;
  try {
    gEvents = await deps.calendar.list(userId, windowStart, windowEnd);
  } catch (e) {
    // Calendar API down / token revoked → report and retry tomorrow.
    console.error(`[gcal-repair] list failed for ${userId}:`, e instanceof Error ? e.message : e);
    result.errors = 1;
    return result;
  }
  const byId = new Map(gEvents.map((e) => [e.id!, e]));

  const isLive = (ev: { status?: string | null } | undefined) =>
    !!ev && ev.status !== 'cancelled';

  for (const b of bookings) {
    const linkedEv = b.googleCalendarEventId ? byId.get(b.googleCalendarEventId) : undefined;
    const linkedLive = isLive(linkedEv);

    // Recurring series: only the first occurrence is repaired.
    if (b.seriesId) {
      const isFirst = !bookings.some(
        (o) => o.seriesId === b.seriesId && o.startTime.getTime() < b.startTime.getTime()
      );
      if (!isFirst) continue;
    }

    const expectedDesc = expectedDescription(b);
    const summary = `${b.eventType.name} - ${b.guestName}`;

    // ---- Cancelled bookings: their event must be gone. ---------------------
    if (b.status === 'CANCELLED') {
      if (linkedLive) {
        try {
          await deps.calendar.del(userId, b.googleCalendarEventId!);
          result.deleted++;
        } catch (e) {
          console.error(`[gcal-repair] delete of cancelled ${b.id} failed:`, e instanceof Error ? e.message : e);
          result.errors++;
        }
      }
      continue;
    }

    // ---- Active bookings: they must have exactly one live event. -----------
    if (!linkedLive) {
      // Class 1/2: missing or stale-linked. Double-check by content: another
      // booking might already own a live event at this exact slot (avoids
      // duplicates when two bookings share an eventId).
      const ownedElsewhere = gEvents.find(
        (e) => isLive(e) && e.id !== b.googleCalendarEventId && sameSlot(e, b) && (e.description || '').includes(b.guestEmail)
      );
      if (ownedElsewhere) {
        // Relink: another event already covers this booking; adopt its id.
        await deps.prisma.booking.update({
          where: { id: b.id },
          data: { googleCalendarEventId: ownedElsewhere.id! },
        }).catch(() => undefined);
        result.relinked++;
        continue;
      }
      try {
        const ev = await deps.calendar.create(userId, {
          summary,
          description: expectedDesc,
          start: b.startTime,
          end: b.endTime,
          attendees: [b.guestEmail],
        });
        if (ev?.id) {
          await deps.prisma.booking.update({
            where: { id: b.id },
            data: { googleCalendarEventId: ev.id },
          }).catch(() => undefined);
          result.created++;
        } else {
          result.errors++;
        }
      } catch (e) {
        console.error(`[gcal-repair] create for booking ${b.id} failed:`, e instanceof Error ? e.message : e);
        result.errors++;
      }
      continue;
    }

    // Class 3: event exists but at the wrong time → move it.
    const evStart = linkedEv!.start?.dateTime ? new Date(linkedEv!.start.dateTime) : null;
    const evEnd = linkedEv!.end?.dateTime ? new Date(linkedEv!.end.dateTime) : null;
    const timeDrift =
      !evStart || !evEnd ||
      Math.abs(evStart.getTime() - b.startTime.getTime()) > 60_000 ||
      Math.abs(evEnd.getTime() - b.endTime.getTime()) > 60_000;
    if (timeDrift) {
      try {
        await deps.calendar.update(userId, linkedEv!.id!, {
          start: b.startTime,
          end: b.endTime,
        });
        result.updated++;
      } catch (e) {
        console.error(`[gcal-repair] update for booking ${b.id} failed:`, e instanceof Error ? e.message : e);
        result.errors++;
      }
    }
  }

  return result;
}

function sameSlot(ev: { start?: { dateTime?: string | null } | null; end?: { dateTime?: string | null } | null }, b: { startTime: Date; endTime: Date }): boolean {
  const s = ev.start?.dateTime ? new Date(ev.start.dateTime).getTime() : null;
  const e = ev.end?.dateTime ? new Date(ev.end.dateTime).getTime() : null;
  if (s === null || e === null) return false;
  return Math.abs(s - b.startTime.getTime()) <= 60_000 && Math.abs(e - b.endTime.getTime()) <= 60_000;
}

/** All user IDs with Google Calendar sync enabled. */
export async function listSyncedOwners(prisma: RepairOwnerDeps['prisma']): Promise<string[]> {
  const owners = await prisma.user.findMany({
    where: { calendarSyncEnabled: true, accounts: { some: { provider: 'google' } } },
    select: { id: true },
  });
  return owners.map((o) => o.id);
}

const LAST_RUN_KEY = 'gcal-repair.lastRun';

export interface GcalRepairLastRun {
  ranAt: string;
  ownersChecked: number;
  created: number;
  updated: number;
  deleted: number;
  relinked: number;
  errors: number;
  ok: boolean;
  durationSec: number;
}

export async function readLastRun(prisma: RepairOwnerDeps['prisma']): Promise<GcalRepairLastRun | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: LAST_RUN_KEY } });
  const value: unknown = row?.value;
  return typeof value === 'object' && value !== null ? (value as GcalRepairLastRun) : null;
}

export async function writeLastRun(prisma: RepairOwnerDeps['prisma'], run: GcalRepairLastRun): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: LAST_RUN_KEY },
    create: { key: LAST_RUN_KEY, value: run as unknown as object },
    update: { value: run as unknown as object },
  });
}
