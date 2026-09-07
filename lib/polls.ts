/**
 * Doodle-style availability polls — pure helpers (unit-testable, no IO).
 *
 * The poll proposes concrete date/time slots; each participant ticks the ones
 * they can attend. Helpers here compute slot end times, participant lookup
 * keys, vote validation and per-slot tallies for the results view.
 */

export interface SlotLike {
  id?: string;
  startTime: Date | string;
  endTime?: Date | string | null;
  durationMinutes?: number;
}

export interface VoteLike {
  slotId: string;
  participant?: { name?: string | null; email?: string | null } | null;
}

export interface SlotTally {
  slotId: string;
  count: number;
  names: string[];
}

/** end = start + duration (default 30 minutes). */
export function slotEnd(start: Date | string, durationMinutes: number): Date {
  const startDate = start instanceof Date ? start : new Date(start);
  return new Date(startDate.getTime() + durationMinutes * 60_000);
}

/** Stable per-poll dedupe key for a participant. */
export function participantLookupKey(name: string, email?: string | null): string {
  const trimmed = (email || '').trim().toLowerCase();
  if (trimmed) return trimmed;
  return `name:${(name || '').trim().toLowerCase()}`;
}

/** Keep only the selected slot ids that actually belong to the poll. */
export function validSlotIds(selected: unknown, allowedIds: string[]): string[] {
  if (!Array.isArray(selected)) return [];
  const allowed = new Set(allowedIds);
  const out: string[] = [];
  for (const id of selected) {
    if (typeof id === 'string' && allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Aggregate raw vote rows into per-slot tallies (ordered by slot input). */
export function aggregateSlotTallies(slotIds: string[], votes: VoteLike[]): Map<string, SlotTally> {
  const tally = new Map<string, SlotTally>();
  for (const slotId of slotIds) tally.set(slotId, { slotId, count: 0, names: [] });
  // Track unique voters per slot: a participant can only tick a slot once.
  const seenPerSlot = new Map<string, Set<string>>();
  for (const vote of votes) {
    const entry = tally.get(vote.slotId);
    if (!entry) continue;
    const who = vote.participant?.name?.trim() || vote.participant?.email?.trim() || '';
    const key = who ? who.toLowerCase() : `#${entry.names.length}`;
    let seen = seenPerSlot.get(vote.slotId);
    if (!seen) {
      seen = new Set<string>();
      seenPerSlot.set(vote.slotId, seen);
    }
    if (seen.has(key)) continue;
    seen.add(key);
    entry.count += 1;
    if (who && !entry.names.includes(who)) entry.names.push(who);
  }
  return tally;
}

export interface RankedSlot {
  slotId: string;
  count: number;
  startTime: Date;
}

/**
 * Best options for the host: most votes first, ties broken by earliest slot.
 */
export function rankSlots(
  slots: Array<{ id: string; startTime: Date | string; count: number }>,
): RankedSlot[] {
  return [...slots]
    .map((s) => ({ slotId: s.id, count: s.count, startTime: new Date(s.startTime) }))
    .sort((a, b) => b.count - a.count || a.startTime.getTime() - b.startTime.getTime());
}

/**
 * Human label for a slot range shown in the host's timezone — used by the
 * dashboard results and by tests.
 */
export function formatSlotRange(
  start: Date | string,
  end: Date | string,
  timezone: string,
  locale = 'es-ES',
): string {
  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  const datePart = startDate.toLocaleDateString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: timezone,
  });
  const startPart = startDate.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });
  const endPart = endDate.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });
  return `${datePart} · ${startPart}–${endPart}`;
}
