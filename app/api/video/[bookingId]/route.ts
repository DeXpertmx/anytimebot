
import { NextRequest, NextResponse } from 'next/server';
import { getVideoSession } from '@/lib/video-session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/video/[bookingId]
 * Get video session for a booking
 * @deprecated - Use /api/video-sessions/[bookingId] instead
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
        { error: 'Video session not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ videoSession });
  } catch (error: any) {
    console.error('Error fetching video session:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
