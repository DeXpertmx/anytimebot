
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { addMinutes } from '@/lib/utils';
import { sendBookingReschedule } from '@/lib/email';
import { verifyBookingToken, generateBookingToken } from '@/lib/booking-tokens';
import { dispatchWebhookEvent, buildBookingPayload } from '@/lib/webhooks';
import { pickResourceForSlot } from '@/lib/resource-assignment';

export const dynamic = 'force-dynamic';

// POST /api/bookings/[id]/reschedule - Reschedule a booking
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const bookingId = params.id;
    const body = await request.json();
    const { newStartTime, token } = body;

    if (!newStartTime) {
      return NextResponse.json(
        { success: false, error: 'New start time is required' },
        { status: 400 }
      );
    }

    // Verify token if provided
    if (token) {
      const verified = verifyBookingToken(token);
      if (!verified || verified.bookingId !== bookingId || verified.operation !== 'reschedule') {
        return NextResponse.json(
          { success: false, error: 'Invalid or expired token' },
          { status: 401 }
        );
      }
    }

    // Get booking
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: true,
              },
            },
            allowedResources: {
              include: {
                resource: {
                  include: {
                    availabilities: true,
                    location: true,
                  },
                },
              },
            },
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
        { success: false, error: 'Cannot reschedule a cancelled booking' },
        { status: 400 }
      );
    }

    const newBookingStartTime = new Date(newStartTime);
    const newBookingEndTime = addMinutes(newBookingStartTime, booking.eventType.duration);

    // Resource-mode events: pick a free resource for the new slot (excluding
    // this booking) instead of the owner/same-event overlap check.
    const resourceMode = booking.eventType.allowedResources.length > 0;
    let pickedResource: { id: string; name: string; location?: { id: string; name: string | null; address: string | null } | null } | null = null;
    if (resourceMode) {
      const pick = await pickResourceForSlot({
        eventTypeId: booking.eventTypeId,
        bookingPageId: booking.eventType.bookingPageId,
        userId: booking.eventType.bookingPage.user.id,
        slotStart: newBookingStartTime,
        slotEnd: newBookingEndTime,
        bufferMinutes: booking.eventType.bufferTime,
        allowedResources: booking.eventType.allowedResources.map((er) => er.resource),
        excludeBookingId: bookingId,
      });
      if (!pick) {
        return NextResponse.json(
          { success: false, error: 'No resource (room/chair) available for the new time slot' },
          { status: 409 }
        );
      }
      pickedResource = pick.resource;
    } else {
      // Check for conflicts
      const conflictingBooking = await prisma.booking.findFirst({
        where: {
          id: { not: bookingId }, // Exclude current booking
          eventTypeId: booking.eventTypeId,
          status: { in: ['CONFIRMED', 'PENDING'] },
          OR: [
            {
              startTime: { lte: newBookingStartTime },
              endTime: { gt: newBookingStartTime },
            },
            {
              startTime: { lt: newBookingEndTime },
              endTime: { gte: newBookingEndTime },
            },
            {
              startTime: { gte: newBookingStartTime },
              endTime: { lte: newBookingEndTime },
            },
          ],
        },
      });

      if (conflictingBooking) {
        return NextResponse.json(
          { success: false, error: 'New time slot is already booked' },
          { status: 409 }
        );
      }
    }

    // Store old start time for email
    const oldStartTime = booking.startTime;

    // Update booking (and refresh the resource/location snapshot on reschedule)
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: {
        startTime: newBookingStartTime,
        endTime: newBookingEndTime,
        status: 'CONFIRMED',
        ...(pickedResource
          ? {
              resourceId: pickedResource.id,
              resourceName: pickedResource.name,
              locationId: pickedResource.location?.id ?? null,
              locationName: pickedResource.location?.name ?? null,
              locationAddress: pickedResource.location?.address ?? null,
            }
          : {}),
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

    // Generate new tokens for the rescheduled booking
    const cancelToken = generateBookingToken(updatedBooking.id, 'cancel');
    const rescheduleToken = generateBookingToken(updatedBooking.id, 'reschedule');

    // Send reschedule email
    try {
      await sendBookingReschedule({
        to: updatedBooking.guestEmail,
        guestName: updatedBooking.guestName,
        eventTitle: updatedBooking.eventType.name,
        oldStartTime,
        newStartTime: updatedBooking.startTime,
        duration: updatedBooking.eventType.duration,
        location: updatedBooking.eventType.location,
        videoLink: updatedBooking.eventType.videoLink || undefined,
        timezone: updatedBooking.timezone,
        cancelToken,
        rescheduleToken,
      });
    } catch (emailError) {
      console.error('Failed to send reschedule email:', emailError);
      // Don't fail the reschedule if email fails
    }

    // Outgoing webhook for external integrations (best-effort, persisted first).
    await dispatchWebhookEvent(
      updatedBooking.eventType.bookingPage.userId,
      'booking.rescheduled',
      buildBookingPayload('booking.rescheduled', updatedBooking),
    );

    return NextResponse.json({
      success: true,
      data: updatedBooking,
    });
  } catch (error) {
    console.error('Error rescheduling booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
