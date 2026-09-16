import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  repairOwnerCalendarLive,
  listSyncedOwners,
  writeLastRun,
  readLastRun,
} from '@/lib/gcal-repair';

export const dynamic = 'force-dynamic';

/**
 * Cron job: daily Google Calendar sync repair.
 *
 * Compares every synced owner's active bookings (CONFIRMED/PENDING, past 30d
 * to next 60d) against the events that actually exist in their Google
 * Calendar and fixes drift:
 *   - missing events → created
 *   - stale/dead eventId links → recreated and relinked
 *   - events at the wrong time → moved
 *   - cancelled bookings whose event survived → event deleted
 *
 * Best-effort per booking: one failure never aborts the sweep, and the run
 * summary is persisted to SystemSetting ('gcal-repair.lastRun') so Admin can
 * show when the repair last ran and what it did.
 *
 * Call with: GET /api/cron/repair-gcal-sync
 * Header: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'dev-secret';

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const startedAt = Date.now();
    const owners = await listSyncedOwners(prisma);
    console.log(`[GCal Repair] Repairing calendar sync for ${owners.length} owner(s)`);

    const totals = { created: 0, updated: 0, deleted: 0, relinked: 0, errors: 0 };
    const perOwner: Array<{ userId: string; created: number; updated: number; deleted: number; relinked: number; errors: number }> = [];

    for (const userId of owners) {
      try {
        const r = await repairOwnerCalendarLive(userId);
        totals.created += r.created;
        totals.updated += r.updated;
        totals.deleted += r.deleted;
        totals.relinked += r.relinked;
        totals.errors += r.errors;
        perOwner.push({
          userId,
          created: r.created,
          updated: r.updated,
          deleted: r.deleted,
          relinked: r.relinked,
          errors: r.errors,
        });
        if (r.created || r.updated || r.deleted || r.relinked || r.errors) {
          console.log(`[GCal Repair] owner ${userId}:`, r);
        }
      } catch (e) {
        totals.errors++;
        console.error(`[GCal Repair] owner ${userId} failed:`, e instanceof Error ? e.message : e);
      }
    }

    const durationSec = Math.round((Date.now() - startedAt) / 1000);
    const summary = {
      ranAt: new Date().toISOString(),
      ownersChecked: owners.length,
      ...totals,
      ok: totals.errors === 0,
      durationSec,
    };
    await writeLastRun(prisma, summary);
    console.log(`[GCal Repair] done in ${durationSec}s:`, totals);

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error('[GCal Repair] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
