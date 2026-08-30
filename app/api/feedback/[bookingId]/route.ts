import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { feedbackToken } from '@/lib/feedback-token';

export const dynamic = 'force-dynamic';

// GET /api/feedback/[bookingId]?t=token - minimal public booking info for the survey page
export async function GET(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  try {
    const token = new URL(request.url).searchParams.get('t') || '';
    if (feedbackToken(params.bookingId) !== token) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 403 });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: params.bookingId },
      select: {
        guestName: true,
        eventType: { select: { name: true } },
        feedback: { select: { id: true } },
      },
    });

    if (!booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        guestName: booking.guestName,
        eventTypeName: booking.eventType.name,
        alreadySubmitted: !!booking.feedback,
      },
    });
  } catch (error) {
    console.error('Error fetching booking for feedback:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
