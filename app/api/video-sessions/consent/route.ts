
import { NextRequest, NextResponse } from 'next/server';
import { updateRecordingConsent } from '@/lib/video-session';
import { recordConsent } from '@/lib/consent';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/video-sessions/consent
 * Update recording consent for a video session and record it (GDPR Art. 7).
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

    // Record granular proof of the recording consent with the subject's email.
    try {
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        select: { guestEmail: true, eventType: { select: { bookingPage: { select: { userId: true } } } } },
      });
      if (booking?.guestEmail) {
        await recordConsent(
          {
            purpose: 'recording',
            subjectEmail: booking.guestEmail,
            tenantId: booking.eventType.bookingPage.userId,
            ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
            userAgent: request.headers.get('user-agent'),
          },
          consent,
        );
      }
    } catch (consentError) {
      console.error('Failed to record recording consent:', consentError);
    }

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
