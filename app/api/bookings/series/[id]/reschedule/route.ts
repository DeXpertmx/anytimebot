import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { verifyBookingToken } from '@/lib/booking-tokens';
import { addMinutes } from '@/lib/utils';
import { expandRecurrence, describeRecurrence } from '@/lib/series';
import { dispatchWebhookEvent, buildBookingPayload } from '@/lib/webhooks';
import { deleteCalendarEvent, createCalendarEvent } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/series/[id]/reschedule
 *
 * Moves all FUTURE occurrences of a series to a new weekly/biweekly slot.
 * The new first occurrence defines the pattern (weekday + wall clock kept via
 * the recurrence rule). Past bookings are untouched.
 *
 * Body: { startTime: ISO, token?: string }
 * Auth: host session or a reschedule token of any booking in the series.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const seriesId = params.id;
    const body = await request.json();
    const token = body.token as string | undefined;
    const newStartTime = new Date(body.startTime);

    if (!body.startTime || Number.isNaN(newStartTime.getTime())) {
      return NextResponse.json(
        { success: false, error: 'A valid startTime is required' },
        { status: 400 }
      );
    }

    const series = await prisma.bookingSeries.findUnique({
      where: { id: seriesId },
      include: {
        bookings: {
          include: {
            eventType: {
              include: { bookingPage: { include: { user: true } } },
            },
          },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    if (!series || series.bookings.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Series not found' },
        { status: 404 }
      );
    }

    const anyBooking = series.bookings[0];
    const ownerId = anyBooking.eventType.bookingPage.userId;

    // Authorization
    let authorized = false;
    const session = await getServerSession(authOptions);
    if (session?.user && (session.user as any).id === ownerId) {
      authorized = true;
    } else if (token) {
      const verified = verifyBookingToken(token);
      if (
        verified &&
        verified.operation === 'reschedule' &&
        series.bookings.some((b) => b.id === verified.bookingId)
      ) {
        authorized = true;
      }
    }
    if (!authorized) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const ruleRaw = series.recurrence as Record<string, unknown> | null;
    const rule = ruleRaw
      ? {
          freq: (ruleRaw.freq === 'BIWEEKLY' ? 'BIWEEKLY' : 'WEEKLY') as 'WEEKLY' | 'BIWEEKLY',
          time: `${String(newStartTime.getHours()).padStart(2, '0')}:${String(newStartTime.getMinutes()).padStart(2, '0')}`,
          byWeekday: newStartTime.getDay(),
          count: Number(ruleRaw.count) || series.bookings.length,
        }
      : null;

    if (!rule) {
      return NextResponse.json(
        { success: false, error: 'Series has no recurrence rule' },
        { status: 400 }
      );
    }

    const eventType = anyBooking.eventType;
    const duration = eventType.duration;
    const now = new Date();

    // Future occurrences still active (not cancelled / not completed)
    const future = series.bookings.filter(
      (b) => b.startTime > now && b.status !== 'CANCELLED' && b.status !== 'COMPLETED'
    );
    if (future.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No upcoming appointments in this series' },
        { status: 400 }
      );
    }

    // New occurrence starts: new first slot, then repeat per the rule
    const newStarts = expandRecurrence(rule, { firstStart: newStartTime }).slice(0, future.length);
    if (newStarts.length < future.length) {
      return NextResponse.json(
        { success: false, error: 'Could not build the new schedule for all remaining appointments' },
        { status: 400 }
      );
    }

    // Conflict check for the new times (excluding our own future bookings)
    const ownIds = new Set(future.map((b) => b.id));
    for (const occ of newStarts) {
      const occEnd = addMinutes(occ, duration);
      const conflict = await prisma.booking.findFirst({
        where: {
          id: { notIn: [...ownIds] },
          status: { in: ['CONFIRMED', 'PENDING'] },
          eventType: { bookingPage: { userId: ownerId } },
          OR: [
            { startTime: { lte: occ }, endTime: { gt: occ } },
            { startTime: { lt: occEnd }, endTime: { gte: occEnd } },
            { startTime: { gte: occ }, endTime: { lte: occEnd } },
          ],
        },
      });
      if (conflict) {
        return NextResponse.json(
          { success: false, error: 'Time slot is already booked' },
          { status: 409 }
        );
      }
    }

    // Apply the new times
    const updates = future.map((b, i) => ({ booking: b, start: newStarts[i] }));
    for (const { booking, start } of updates) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          startTime: start,
          endTime: addMinutes(start, duration),
          status: booking.status === 'PENDING' ? 'PENDING' : booking.status,
          reminder24hSent: false,
          reminder1hSent: false,
        },
      });
    }

    // Google Calendar: delete old events, create new ones (best-effort)
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, calendarSyncEnabled: true, accounts: { where: { provider: 'google' }, select: { access_token: true } } },
    });
    if (owner?.calendarSyncEnabled && owner.accounts.length > 0) {
      for (const { booking, start } of updates) {
        if (booking.googleCalendarEventId) {
          try {
            await deleteCalendarEvent(ownerId, booking.googleCalendarEventId);
          } catch (e) {
            console.error('Failed to delete old series calendar event:', e);
          }
        }
        try {
          const ev = await createCalendarEvent(ownerId, {
            summary: `${eventType.name} - ${booking.guestName}`,
            description: `Booking with ${booking.guestName}\nEmail: ${booking.guestEmail}`,
            location: eventType.location === 'video' && eventType.videoLink ? eventType.videoLink : eventType.location,
            start,
            end: addMinutes(start, duration),
            attendees: [booking.guestEmail],
          });
          if (ev?.id) {
            await prisma.booking
              .update({ where: { id: booking.id }, data: { googleCalendarEventId: ev.id } })
              .catch(() => undefined);
          }
        } catch (e) {
          console.error('Failed to create new series calendar event:', e);
        }
      }
    }

    // Webhooks: booking.rescheduled per moved occurrence
    for (const { booking, start } of updates) {
      await dispatchWebhookEvent(
        ownerId,
        'booking.rescheduled',
        buildBookingPayload('booking.rescheduled', { ...booking, startTime: start, endTime: addMinutes(start, duration) })
      ).catch(() => undefined);
    }

    return NextResponse.json({
      success: true,
      data: {
        seriesId,
        moved: updates.length,
        summary: describeRecurrence(rule, 'es'),
        newStarts: newStarts.map((d) => d.toISOString()),
      },
    });
  } catch (error) {
    console.error('Error rescheduling series:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
