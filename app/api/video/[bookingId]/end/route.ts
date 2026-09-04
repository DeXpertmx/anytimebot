
import { NextRequest, NextResponse } from 'next/server';
import { getVideoSession, updateVideoSessionAfterMeeting } from '@/lib/video-session';
import { prisma } from '@/lib/db';
import { dispatchWebhookEvent, buildBookingPayload } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

/**
 * POST /api/video/[bookingId]/end
 * Mark meeting as ended
 * @deprecated - Use webhook handler instead
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  try {
    const { bookingId } = params;

    const videoSession = await getVideoSession(bookingId);

    if (!videoSession) {
      return NextResponse.json(
        { error: 'Video session not found' },
        { status: 404 }
      );
    }

    // Update meeting as ended
    const updated = await updateVideoSessionAfterMeeting(bookingId, {
      endedAt: new Date(),
    });

    // Update booking status
    const updatedBooking = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: 'COMPLETED' },
      include: {
        eventType: {
          include: {
            bookingPage: {
              select: { id: true, title: true, slug: true, userId: true },
            },
          },
        },
      },
    });

    // Outgoing webhook for external integrations (best-effort, persisted first).
    await dispatchWebhookEvent(
      updatedBooking.eventType.bookingPage.userId,
      'booking.completed',
      buildBookingPayload('booking.completed', updatedBooking),
    );

    return NextResponse.json({ videoSession: updated });
  } catch (error: any) {
    console.error('Error ending meeting:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
