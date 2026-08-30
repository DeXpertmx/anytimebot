import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { feedbackToken } from '@/lib/feedback-token';

export const dynamic = 'force-dynamic';

// POST /api/feedback - submit feedback for a booking (public, token-protected)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookingId, token, rating, comment } = body;

    if (!bookingId || !token || !rating) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json(
        { success: false, error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    if (feedbackToken(bookingId) !== token) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 403 });
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, eventTypeId: true },
    });
    if (!booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }

    const feedback = await prisma.feedback.upsert({
      where: { bookingId },
      create: { bookingId, rating, comment: comment?.slice(0, 2000) || null },
      update: { rating, comment: comment?.slice(0, 2000) || null },
    });

    return NextResponse.json({ success: true, data: feedback });
  } catch (error) {
    console.error('Error submitting feedback:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/feedback - summary of the owner's feedback (dashboard, auth-protected)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;

    const feedbacks = await prisma.feedback.findMany({
      where: { booking: { eventType: { bookingPage: { userId } } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        booking: {
          select: {
            guestName: true,
            guestEmail: true,
            startTime: true,
            eventType: { select: { name: true } },
          },
        },
      },
    });

    const total = feedbacks.length;
    const average = total > 0 ? feedbacks.reduce((sum, f) => sum + f.rating, 0) / total : 0;
    const distribution = [1, 2, 3, 4, 5].map(
      (stars) => feedbacks.filter((f) => f.rating === stars).length
    );

    return NextResponse.json({
      success: true,
      data: {
        summary: { total, average: Math.round(average * 10) / 10, distribution },
        feedbacks: feedbacks.map((f) => ({
          id: f.id,
          rating: f.rating,
          comment: f.comment,
          createdAt: f.createdAt,
          guestName: f.booking.guestName,
          eventTypeName: f.booking.eventType.name,
          startTime: f.booking.startTime,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
