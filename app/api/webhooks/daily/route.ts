
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateVideoSessionAfterMeeting, generateMeetingSummary } from '@/lib/video-session';
import { getRoomRecordings } from '@/lib/daily';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * POST /api/webhooks/daily
 * Handle Daily.co webhooks for meeting events
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { event, room, recording, transcript } = payload;

    console.log('Daily.co webhook received:', event, room);

    // Handle different webhook events
    switch (event) {
      case 'room.closed':
        await handleRoomClosed(room);
        break;

      case 'recording.ready':
        await handleRecordingReady(room, recording);
        break;

      case 'transcription.ready':
        await handleTranscriptionReady(room, transcript);
        break;

      default:
        console.log('Unhandled webhook event:', event);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error processing Daily.co webhook:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle room closed event
 */
async function handleRoomClosed(roomName: string) {
  try {
    // Find video session by room name
    const videoSession = await prisma.videoSession.findFirst({
      where: { roomName },
      include: {
        booking: {
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
        },
      },
    });

    if (!videoSession) {
      console.log('Video session not found for room:', roomName);
      return;
    }

    // Update booking status to completed
    await prisma.booking.update({
      where: { id: videoSession.bookingId },
      data: { status: 'COMPLETED' },
    });

    // Fetch recordings if available
    const recordings = await getRoomRecordings(roomName);
    if (recordings.length > 0) {
      const latestRecording = recordings[0];
      await updateVideoSessionAfterMeeting(videoSession.bookingId, {
        recordingUrl: latestRecording.download_link,
        endedAt: new Date(),
      });
    } else {
      await updateVideoSessionAfterMeeting(videoSession.bookingId, {
        endedAt: new Date(),
      });
    }

    console.log('Room closed processed:', roomName);
  } catch (error) {
    console.error('Error handling room closed:', error);
  }
}

/**
 * Handle recording ready event
 */
async function handleRecordingReady(roomName: string, recording: any) {
  try {
    const videoSession = await prisma.videoSession.findFirst({
      where: { roomName },
    });

    if (!videoSession) {
      return;
    }

    await updateVideoSessionAfterMeeting(videoSession.bookingId, {
      recordingUrl: recording.download_link,
      duration: Math.round(recording.duration / 60), // Convert to minutes
    });

    console.log('Recording ready processed:', roomName);
  } catch (error) {
    console.error('Error handling recording ready:', error);
  }
}

/**
 * Handle transcription ready event
 */
async function handleTranscriptionReady(roomName: string, transcript: any) {
  try {
    const videoSession = await prisma.videoSession.findFirst({
      where: { roomName },
      include: {
        booking: {
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
        },
      },
    });

    if (!videoSession) {
      return;
    }

    // Extract transcript text
    const transcriptText = typeof transcript === 'string' 
      ? transcript 
      : JSON.stringify(transcript);

    // Update video session with transcript
    await updateVideoSessionAfterMeeting(videoSession.bookingId, {
      transcript: transcriptText,
    });

    // Generate AI summary
    const context = {
      eventName: videoSession.booking.eventType.name,
      hostName: videoSession.booking.eventType.bookingPage.user.name,
      guestName: videoSession.booking.guestName,
      duration: videoSession.duration,
    };

    const summary = await generateMeetingSummary(transcriptText, context);

    if (summary) {
      await updateVideoSessionAfterMeeting(videoSession.bookingId, {
        summary: summary.summary,
        actionItems: summary.actionItems,
        keyPoints: summary.keyPoints,
        sentiment: summary.sentiment,
      });

      // Send follow-up email to guest
      await sendFollowUpEmail(videoSession.booking, summary);
    }

    console.log('Transcription processed and summary generated:', roomName);
  } catch (error) {
    console.error('Error handling transcription ready:', error);
  }
}

/**
 * Send follow-up email with meeting summary
 */
async function sendFollowUpEmail(booking: any, summary: any) {
  try {
    const emailContent = `
      <h2>Gracias por tu reunión</h2>
      <p>Hola ${booking.guestName},</p>
      <p>Gracias por reunirte con nosotros. Aquí está el resumen de nuestra conversación:</p>
      
      <h3>Resumen</h3>
      <p>${summary.summary}</p>
      
      ${summary.keyPoints?.length > 0 ? `
        <h3>Puntos Clave</h3>
        <ul>
          ${summary.keyPoints.map((point: string) => `<li>${point}</li>`).join('')}
        </ul>
      ` : ''}
      
      ${summary.actionItems?.length > 0 ? `
        <h3>Acciones Pendientes</h3>
        <ul>
          ${summary.actionItems.map((item: any) => `
            <li>${item.text}${item.assignee ? ` - ${item.assignee}` : ''}${item.dueDate ? ` - ${item.dueDate}` : ''}</li>
          `).join('')}
        </ul>
      ` : ''}
      
      ${summary.nextSteps?.length > 0 ? `
        <h3>Próximos Pasos</h3>
        <ul>
          ${summary.nextSteps.map((step: string) => `<li>${step}</li>`).join('')}
        </ul>
      ` : ''}
      
      <p>Si tienes alguna pregunta o necesitas reprogramar, no dudes en contactarnos.</p>
    `;

    await sendEmail({
      to: booking.guestEmail,
      subject: `Resumen de tu reunión: ${booking.eventType.name}`,
      html: emailContent,
    });
  } catch (error) {
    console.error('Error sending follow-up email:', error);
  }
}
