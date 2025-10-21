
import { NextRequest, NextResponse } from 'next/server';
import { updateRecordingConsent } from '@/lib/video-session';

export const dynamic = 'force-dynamic';

/**
 * POST /api/video-sessions/consent
 * Update recording consent for a video session
 */
export async function POST(request: NextRequest) {
  try {
    const { bookingId, consent } = await request.json();

    if (!bookingId || typeof consent !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'Invalid request' },
        { status: 400 }
      );
    }

    const videoSession = await updateRecordingConsent(bookingId, consent);

    return NextResponse.json({
      success: true,
      videoSession,
    });
  } catch (error: any) {
    console.error('Error updating recording consent:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
