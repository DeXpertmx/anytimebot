
import { NextRequest, NextResponse } from 'next/server';
import { getVideoSession, updateVideoSessionAfterMeeting } from '@/lib/video-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/video/[bookingId]/transcript
 * Update transcript for a video session
 * @deprecated - Use webhook handler instead
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { bookingId: string } }
) {
  try {
    const { bookingId } = params;
    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      );
    }

    const videoSession = await getVideoSession(bookingId);

    if (!videoSession) {
      return NextResponse.json(
        { error: 'Video session not found' },
        { status: 404 }
      );
    }

    // Update with transcript
    const updated = await updateVideoSessionAfterMeeting(bookingId, {
      transcript,
    });

    return NextResponse.json({ videoSession: updated });
  } catch (error: any) {
    console.error('Error updating transcript:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
