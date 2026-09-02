import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyBookingToken } from '@/lib/booking-tokens';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings/[id]/public?token=...
 * Public, token-protected booking details used by the guest reschedule page.
 * Only returns the fields needed to offer a new slot (never guest contact data
 * beyond the booking date itself).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bookingId = params.id;
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token is required' },
        { status: 401 }
      );
    }

    const verified = verifyBookingToken(token);
    if (!verified || verified.bookingId !== bookingId || verified.operation !== 'reschedule') {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        guestName: true,
        startTime: true,
        endTime: true,
        timezone: true,
        status: true,
        eventType: {
          select: {
            id: true,
            name: true,
            duration: true,
            bookingPageId: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    if (booking.status === 'CANCELLED') {
      return NextResponse.json(
        { success: false, error: 'This booking has been cancelled and cannot be rescheduled' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, booking });
  } catch (error) {
    console.error('Error fetching public booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
