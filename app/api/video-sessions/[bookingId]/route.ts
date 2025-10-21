
import { NextRequest, NextResponse } from 'next/server';
import { getVideoSession } from '@/lib/video-session';

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

    return NextResponse.json({
      success: true,
      videoSession,
    });
  } catch (error: any) {
    console.error('Error fetching video session:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
