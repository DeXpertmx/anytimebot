
/**
 * Video Session Management
 * Creates and manages video sessions for bookings
 */

import { prisma } from '@/lib/db';
import { createDailyRoom, createMeetingToken } from '@/lib/daily';
import { VideoProvider } from '@prisma/client';

interface CreateVideoSessionParams {
  bookingId: string;
  provider: VideoProvider;
  eventTypeConfig: {
    enableRecording: boolean;
    enableTranscription: boolean;
    enableLiveAI: boolean;
  };
  meetingDetails: {
    title: string;
    startTime: Date;
    guestName: string;
  };
}

/**
 * Create a video session for a booking
 */
export async function createVideoSession(params: CreateVideoSessionParams) {
  const { bookingId, provider, eventTypeConfig, meetingDetails } = params;

  // Check if video session already exists
  const existing = await prisma.videoSession.findUnique({
    where: { bookingId },
  });

  if (existing) {
    return existing;
  }

  let roomUrl = '';
  let hostRoomUrl = '';
  let dailyRoomId = null;
  let roomName = null;

  if (provider === VideoProvider.DAILY) {
    // Create Daily.co room
    const roomNameSlug = `meetmind-${bookingId.slice(0, 8)}-${Date.now()}`;
    const expTimestamp = Math.floor(meetingDetails.startTime.getTime() / 1000) + (24 * 60 * 60);

    const result = await createDailyRoom({
      name: roomNameSlug,
      privacy: 'private',
      properties: {
        enable_recording: eventTypeConfig.enableRecording ? 'cloud' : undefined,
        enable_transcription: eventTypeConfig.enableTranscription || eventTypeConfig.enableLiveAI,
        exp: expTimestamp,
        eject_at_room_exp: true,
      },
    });

    if (!result.success || !result.room) {
      throw new Error(`Failed to create Daily.co room: ${result.error}`);
    }

    dailyRoomId = result.room.id;
    roomName = result.room.name;
    roomUrl = result.room.url;

    // Create host token with elevated permissions
    const hostToken = await createMeetingToken(roomName, true);
    if (hostToken) {
      hostRoomUrl = `${roomUrl}?t=${hostToken}`;
    } else {
      hostRoomUrl = roomUrl;
    }
  } else if (provider === VideoProvider.GOOGLE_MEET) {
    // For now, Google Meet rooms are created via Google Calendar API
    // This will be handled in the calendar event creation
    roomUrl = 'https://meet.google.com/'; // Placeholder
  } else if (provider === VideoProvider.ZOOM) {
    // Zoom integration would go here
    roomUrl = 'https://zoom.us/'; // Placeholder
  } else {
    // Custom video link
    roomUrl = 'Custom video link'; // Will be set by event type
  }

  // Create video session in database
  const videoSession = await prisma.videoSession.create({
    data: {
      bookingId,
      provider,
      roomUrl,
      hostRoomUrl: hostRoomUrl || roomUrl,
      dailyRoomId,
      roomName,
      recordingConsent: false, // Will be updated when guest joins
      liveNotesEnabled: eventTypeConfig.enableLiveAI,
    },
  });

  return videoSession;
}

/**
 * Get video session by booking ID
 */
export async function getVideoSession(bookingId: string) {
  return await prisma.videoSession.findUnique({
    where: { bookingId },
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
}

/**
 * Update video session with recording consent
 */
export async function updateRecordingConsent(bookingId: string, consent: boolean) {
  return await prisma.videoSession.update({
    where: { bookingId },
    data: { recordingConsent: consent },
  });
}

/**
 * Update video session after meeting ends
 */
export async function updateVideoSessionAfterMeeting(
  bookingId: string,
  data: {
    recordingUrl?: string;
    transcript?: string;
    summary?: string;
    actionItems?: any;
    keyPoints?: any;
    sentiment?: string;
    duration?: number;
    startedAt?: Date;
    endedAt?: Date;
  }
) {
  return await prisma.videoSession.update({
    where: { bookingId },
    data,
  });
}

/**
 * Generate AI meeting summary from transcript
 */
export async function generateMeetingSummary(transcript: string, context: any) {
  try {
    const response = await fetch('https://api.abacus.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un asistente AI especializado en generar resúmenes de reuniones. Tu tarea es analizar la transcripción de una reunión y extraer:
1. Resumen ejecutivo (2-3 oraciones)
2. Puntos clave discutidos
3. Decisiones tomadas
4. Acciones pendientes (action items) con responsables si se mencionan
5. Próximos pasos
6. Sentimiento general de la reunión (positivo, neutral, negativo)

Formato tu respuesta en JSON con esta estructura:
{
  "summary": "Resumen ejecutivo...",
  "keyPoints": ["punto 1", "punto 2", ...],
  "decisions": ["decisión 1", "decisión 2", ...],
  "actionItems": [
    {"text": "tarea", "assignee": "persona (si se menciona)", "dueDate": "fecha (si se menciona)"}
  ],
  "nextSteps": ["paso 1", "paso 2", ...],
  "sentiment": "positive|neutral|negative"
}`,
          },
          {
            role: 'user',
            content: `Contexto de la reunión:
- Evento: ${context.eventName || 'N/A'}
- Anfitrión: ${context.hostName || 'N/A'}
- Invitado: ${context.guestName || 'N/A'}
- Duración: ${context.duration || 'N/A'} minutos

Transcripción:
${transcript}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('No content in response');
    }

    // Try to parse JSON response
    try {
      const parsed = JSON.parse(content);
      return parsed;
    } catch {
      // If not valid JSON, return raw content
      return {
        summary: content,
        keyPoints: [],
        decisions: [],
        actionItems: [],
        nextSteps: [],
        sentiment: 'neutral',
      };
    }
  } catch (error) {
    console.error('Error generating meeting summary:', error);
    return null;
  }
}
