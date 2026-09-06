
import { NextRequest, NextResponse } from 'next/server';
import { getVideoSession } from '@/lib/video-session';
import {
  findCustomersByGuestEmails,
  attachCustomerToBooking,
} from '@/lib/customer-match';

export const dynamic = 'force-dynamic';

/**
 * GET /api/video-sessions/[bookingId]
 * Get video session details for a booking
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  try {
    const { bookingId } = params;

    const videoSession = await getVideoSession(bookingId);

    if (!videoSession) {
      return NextResponse.json(
        { success: false, error: 'Video session not found' },
        { status: 404 }
      );
    }

    // Attach the CRM customer (photo, company) when the guest email matches a
    // saved contact, so the meeting room and briefing can show who the guest is.
    const hostUserId = videoSession.booking.eventType.bookingPage.userId;
    const customersByEmail = await findCustomersByGuestEmails(hostUserId, [
      videoSession.booking.guestEmail,
    ]);
    const sessionWithCustomer = {
      ...videoSession,
      booking: attachCustomerToBooking(videoSession.booking, customersByEmail),
    };

    return NextResponse.json({
      success: true,
      videoSession: sessionWithCustomer,
    });
  } catch (error: any) {
    console.error('Error fetching video session:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
