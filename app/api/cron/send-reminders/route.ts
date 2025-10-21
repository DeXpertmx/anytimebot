
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendBookingReminder } from '@/lib/email';
import { generateBookingToken } from '@/lib/booking-tokens';

export const dynamic = 'force-dynamic';

/**
 * Cron job to send reminders 24 hours before bookings
 * This should be called by a cron service (e.g., Vercel Cron, AWS EventBridge, etc.)
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

    // Calculate 24 hours from now (with 1 hour window)
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);

    // Find bookings that start in approximately 24 hours and haven't been reminded
    const bookings = await prisma.booking.findMany({
      where: {
        startTime: {
          gte: in23Hours,
          lte: in24Hours,
        },
        status: { in: ['CONFIRMED', 'PENDING'] },
        // We would track if reminder was sent in a production app
        // reminderSent: false,
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

    console.log(`Found ${bookings.length} bookings to send reminders for`);

    // Send reminders
    const results = await Promise.allSettled(
      bookings.map(async (booking) => {
        try {
          // Generate tokens for cancel/reschedule links
          const cancelToken = generateBookingToken(booking.id, 'cancel');
          const rescheduleToken = generateBookingToken(booking.id, 'reschedule');

          await sendBookingReminder({
            to: booking.guestEmail,
            guestName: booking.guestName,
            eventTitle: booking.eventType.name,
            startTime: booking.startTime,
            videoLink: booking.eventType.videoLink || undefined,
            location: booking.eventType.location,
            timezone: booking.timezone,
            cancelToken,
            rescheduleToken,
          });

          console.log(`Reminder sent for booking ${booking.id}`);
          return { success: true, bookingId: booking.id };
        } catch (error) {
          console.error(`Failed to send reminder for booking ${booking.id}:`, error);
          return { success: false, bookingId: booking.id, error };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    const failed = results.length - successful;

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
