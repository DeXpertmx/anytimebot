import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendBookingReminderWithTemplate } from '@/lib/email';
import { bookingVenueText } from '@/lib/booking-venue';
import { generateBookingToken } from '@/lib/booking-tokens';
import { window24h } from '@/lib/reminder-windows';

export const dynamic = 'force-dynamic';

/**
 * Cron job: send the 24-hour email reminder.
 *
 * Runs hourly; the query window is wide (±60 min) so an hourly schedule never
 * misses a booking, and `reminder24hSent` guarantees each booking is reminded
 * at most once even if the cron runs more often. Flags are set only after a
 * successful send so transient failures are retried on the next run.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'dev-secret';

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { from, to } = window24h(new Date());

    // Bookings starting in the next ~24h (±1h) that have not been reminded yet.
    // reminder24hSent defaults to false on new bookings; series reschedules
    // and individual reschedules both reset it.
    const bookings = await prisma.booking.findMany({
      where: {
        startTime: { gte: from, lte: to },
        status: { in: ['CONFIRMED', 'PENDING'] },
        reminder24hSent: false,
      },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    console.log(`[Email Reminders] Found ${bookings.length} bookings for 24h reminders`);

    let successful = 0;
    let failed = 0;

    for (const booking of bookings) {
      try {
        // Generate tokens for cancel/reschedule links
        const cancelToken = generateBookingToken(booking.id, 'cancel');
        const rescheduleToken = generateBookingToken(booking.id, 'reschedule');

        const sent = await sendBookingReminderWithTemplate({
          userId: booking.eventType.bookingPage.userId,
          to: booking.guestEmail,
          guestName: booking.guestName,
          eventTitle: booking.eventType.name,
          startTime: booking.startTime,
          videoLink: (booking as any).meetingUrl || booking.eventType.videoLink || undefined,
          location: booking.eventType.location,
          venue: bookingVenueText(booking),
          timezone: booking.timezone,
          cancelToken,
          rescheduleToken,
          hoursBefore: 24,
        });

        if (sent) {
          // Mark only on success so a transient email failure is retried next run.
          await prisma.booking.update({
            where: { id: booking.id },
            data: { reminder24hSent: true },
          });
          successful++;
        } else {
          failed++;
          console.error(`[Email Reminders] sendEmail returned false for booking ${booking.id}`);
        }
      } catch (error) {
        failed++;
        console.error(`[Email Reminders] Failed to send reminder for booking ${booking.id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        total: bookings.length,
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error('Error in send-reminders cron job:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
