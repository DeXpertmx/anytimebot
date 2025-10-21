
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createVideoSession } from '@/lib/video-session';

export const dynamic = 'force-dynamic';

/**
 * Create a video room for a booking
 * POST /api/video/create-room
 * @deprecated - Use /api/video-sessions/create instead
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { bookingId } = body;

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required' },
        { status: 400 }
      );
    }

    // Get booking details
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
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Check if user owns this booking
    if (booking.eventType.bookingPage.user.email !== session.user.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    // Check if video session already exists
    const existingSession = await prisma.videoSession.findUnique({
      where: { bookingId },
    });

    if (existingSession) {
      return NextResponse.json({ videoSession: existingSession });
    }

    // Create video session using new API
    const videoSession = await createVideoSession({
      bookingId: booking.id,
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

    return NextResponse.json({ videoSession });
  } catch (error) {
    console.error('Error creating video room:', error);
    return NextResponse.json(
      { error: 'Failed to create video room' },
      { status: 500 }
    );
  }
}
