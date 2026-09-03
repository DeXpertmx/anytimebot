/**
 * Automatic AI meeting summary.
 *
 * When the host marks a booking as finished (COMPLETED), this module builds a
 * summary from the booking data (event, host, guest, form answers) plus any
 * available meeting transcript (self-hosted video), generates a structured
 * Spanish summary through the shared LLM client (OrcaRouter → DeepSeek) and
 * saves it into the booking's `notes` field so it shows up in the dashboard
 * and inside the meeting room.
 *
 * The summary is only auto-generated when the host has not written manual
 * notes yet — it never overwrites what the host typed by hand.
 */

import { prisma } from '@/lib/db';
import { completeChat } from '@/lib/llm-client';

export type MeetingSummaryResult = {
  summary: string;
  skipped: boolean;
};

function formatFormData(
  formData: Record<string, unknown> | null | undefined,
  formFields: Array<{ id: string; label: string }>,
): string {
  if (!formData || Object.keys(formData).length === 0) return '';
  return Object.entries(formData)
    .map(([key, value]) => {
      const field = formFields.find((f) => f.id === key);
      const label = field?.label ?? key.replace(/([A-Z])/g, ' $1').trim();
      const stringValue =
        typeof value === 'boolean' ? (value ? 'Sí' : 'No') : String(value ?? '');
      return `- ${label}: ${stringValue}`;
    })
    .join('\n');
}

/**
 * Generates an AI summary for a finished meeting and saves it into the
 * booking's notes. Returns `{ summary, skipped }`:
 *  - `skipped: true` when the host already wrote manual notes (nothing is
 *    generated nor overwritten) or when there is no booking.
 *  - On LLM failure it throws — callers should treat it as best-effort.
 */
export async function generateMeetingSummary(
  bookingId: string,
): Promise<MeetingSummaryResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      eventType: {
        include: {
          bookingPage: { include: { user: true } },
          formFields: true,
        },
      },
      videoSession: true,
    },
  });

  if (!booking) {
    return { summary: '', skipped: true };
  }

  // Never overwrite manual host notes.
  if (booking.notes && booking.notes.trim().length > 0) {
    return { summary: '', skipped: true };
  }

  const hostName =
    booking.eventType.bookingPage.user.name || booking.eventType.bookingPage.user.email;

  const formAnswers = formatFormData(
    (booking.formData as Record<string, unknown> | null) ?? undefined,
    booking.eventType.formFields ?? [],
  );

  const transcript = booking.videoSession?.transcript?.trim();
  const transcriptExcerpt = transcript ? transcript.slice(0, 12000) : '';
  const videoSummary = booking.videoSession?.summary?.trim();
  const keyPoints = booking.videoSession?.keyPoints as unknown;
  const actionItems = booking.videoSession?.actionItems as unknown;

  const meetingContext = [
    `- Evento: ${booking.eventType.name}`,
    `- Anfitrión: ${hostName}`,
    `- Invitado: ${booking.guestName} (${booking.guestEmail}${booking.guestPhone ? `, ${booking.guestPhone}` : ''})`,
    `- Fecha y hora: ${booking.startTime.toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}`,
    `- Duración: ${booking.eventType.duration} minutos`,
    `- Zona horaria: ${booking.timezone}`,
  ].join('\n');

  const formSection = formAnswers
    ? `\n\nRespuestas del formulario de reserva:\n${formAnswers}`
    : '';
  const transcriptSection = transcriptExcerpt
    ? `\n\nTranscripción de la reunión:\n${transcriptExcerpt}`
    : videoSummary
      ? `\n\nResumen técnico previo de la reunión:\n${videoSummary}`
      : '';
  const keyPointsSection =
    keyPoints && Array.isArray(keyPoints) && keyPoints.length > 0
      ? `\n\nPuntos clave detectados: ${JSON.stringify(keyPoints)}`
      : '';
  const actionItemsSection =
    actionItems && Array.isArray(actionItems) && actionItems.length > 0
      ? `\n\nAcciones detectadas: ${JSON.stringify(actionItems)}`
      : '';

  const system =
    'Eres un asistente experto en resumir reuniones de negocios. ' +
    'Siempre respondes en español, en formato Markdown, con un tono profesional y conciso. ' +
    'Si no hay transcripción, basa el resumen en los datos de la cita y las respuestas del formulario, y no inventes hechos.';

  const user =
    `Genera un resumen de la reunión con la siguiente estructura en Markdown:\n\n` +
    `## Resumen ejecutivo\nUna síntesis de 2-3 frases sobre de qué trató la reunión.\n\n` +
    `## Puntos clave\nLista breve de los temas o decisiones importantes.\n\n` +
    `## Acciones pendientes\nLista de tareas o seguimientos acordados (si se conocen).\n\n` +
    `## Próximos pasos\nCierre con los siguientes pasos sugeridos.\n\n` +
    `Datos de la cita:\n${meetingContext}${formSection}${transcriptSection}${keyPointsSection}${actionItemsSection}\n\n` +
    `Resumen (Markdown, en español):`;

  const content = await completeChat({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 900,
    temperature: 0.4,
  });

  const summary = content.trim();
  if (!summary) {
    throw new Error('LLM returned an empty meeting summary');
  }

  await prisma.booking.update({
    where: { id: bookingId },
    data: { notes: summary },
  });

  return { summary, skipped: false };
}