import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendBookingCancellation, sendSeriesCancellation } from '@/lib/email';
import { verifyBookingToken } from '@/lib/booking-tokens';
import { notifyAdminBookingCancelled } from '@/lib/system-whatsapp';
import { dispatchWebhookEvent, buildBookingPayload } from '@/lib/webhooks';
import { deleteCalendarEvent } from '@/lib/google-calendar';
import { parseRecurrence, describeRecurrence } from '@/lib/series';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/series/[id]/cancel
 *
 * Cancels all FUTURE occurrences of a recurring series (past/completed and
 * already-cancelled bookings stay untouched). Auth: host session, or the
 * cancel token of any booking belonging to the series (guest self-service).
 *
 * Body: { token?: string, seriesId is in the URL }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const seriesId = params.id;
    const body = await request.json().catch(() => ({}));
    const token = (body as { token?: string }).token;

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

    // Authorization: host session OR a valid guest cancel token of the series
    let authorized = false;
    const session = await getServerSession(authOptions);
    if (session?.user && (session.user as any).id === ownerId) {
      authorized = true;
    } else if (token) {
      const verified = verifyBookingToken(token);
      if (
        verified &&
        verified.operation === 'cancel' &&
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

    const now = new Date();
    const future = series.bookings.filter(
      (b) => b.startTime > now && b.status !== 'CANCELLED' && b.status !== 'COMPLETED'
    );

    if (future.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No upcoming appointments in this series' },
        { status: 400 }
      );
    }

    // Cancel all future occurrences
    const ids = future.map((b) => b.id);
    await prisma.booking.updateMany({
      where: { id: { in: ids } },
      data: { status: 'CANCELLED' },
    });

    // Best-effort Google Calendar cleanup per occurrence
    for (const b of future) {
      if (b.googleCalendarEventId) {
        try {
          await deleteCalendarEvent(ownerId, b.googleCalendarEventId);
        } catch (e) {
          console.error('Failed to delete calendar event for series booking:', e);
        }
      }
    }

    // One consolidated email listing the cancelled dates
    try {
      await sendSeriesCancellation({
        to: anyBooking.guestEmail,
        guestName: anyBooking.guestName,
        eventTitle: anyBooking.eventType.name,
        startTimes: future.map((b) => b.startTime),
        timezone: anyBooking.timezone,
      });
    } catch (emailError) {
      console.error('Failed to send series cancellation email:', emailError);
    }

    // Admin notification (once, summarizing the series)
    await notifyAdminBookingCancelled({
      guestName: anyBooking.guestName,
      guestEmail: anyBooking.guestEmail,
      guestPhone: anyBooking.guestPhone,
      eventTypeName: `${anyBooking.eventType.name} (serie: ${future.length} citas)`,
      startTime: future[0].startTime,
      timezone: anyBooking.timezone,
    });

    // Outgoing webhooks, one per cancelled booking
    for (const b of future) {
      await dispatchWebhookEvent(
        ownerId,
        'booking.cancelled',
        buildBookingPayload('booking.cancelled', { ...b, status: 'CANCELLED' as const })
      ).catch(() => undefined);
    }

    const rule = parseRecurrence(series.recurrence);
    return NextResponse.json({
      success: true,
      data: {
        seriesId,
        cancelled: ids.length,
        summary: rule ? describeRecurrence(rule, 'es') : null,
        cancelledStarts: future.map((b) => b.startTime.toISOString()),
      },
    });
  } catch (error) {
    console.error('Error cancelling series:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
