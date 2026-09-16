/**
 * Google Calendar event description builder.
 *
 * Appends the join link (Zoom/Teams/Meet/Daily or manual) to the event
 * description so the guest and the host can join directly from Google
 * Calendar. The base description keeps the booking context (guest name,
 * email, phone) and the venue line is appended too when available.
 */

export interface CalendarDescriptionInput {
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  /** Join URL for the video meeting, when the event type uses one. */
  meetingUrl?: string | null;
  /** Physical venue text ("Sillón 2 · Sede · Dirección"), when any. */
  venue?: string | null;
  /** Label shown before the link, e.g. "Zoom". Defaults to "Reunión". */
  meetingProvider?: string | null;
}

export function buildCalendarDescription(input: CalendarDescriptionInput): string {
  const lines: string[] = [];
  lines.push(`Reserva con ${input.guestName}`);
  lines.push(`Email: ${input.guestEmail}`);
  if (input.guestPhone) lines.push(`Teléfono: ${input.guestPhone}`);
  if (input.venue) lines.push(`Lugar: ${input.venue}`);
  if (input.meetingUrl) {
    const label = input.meetingProvider || 'Reunión';
    lines.push('');
    lines.push(`🔗 ${label}: ${input.meetingUrl}`);
  }
  return lines.join('\n');
}
