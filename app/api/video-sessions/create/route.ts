
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createVideoSession } from '@/lib/video-session';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/video-sessions/create
 * Create a video session for a booking
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json(
        { success: false, error: 'Booking ID required' },
        { status: 400 }
      );
    }

    // Get booking with event type details
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

    // Check if user owns this booking
    const userId = (session.user as any).id;
    if (booking.eventType.bookingPage.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Create video session
    const videoSession = await createVideoSession({
      bookingId,
      provider: booking.eventType.videoProvider,
      eventTypeConfig: {
        enableRecording: booking.eventType.enableRecording,
        enableTranscription: booking.eventType.enableTranscription,
        enableLiveAI: booking.eventType.enableLiveAI,
      },
      meetingDetails: {
        title: booking.eventType.name,
        startTime: booking.startTime,
        guestName: booking.guestName,
      },
    });

    return NextResponse.json({
      success: true,
      videoSession,
    });
  } catch (error: any) {
    console.error('Error creating video session:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
