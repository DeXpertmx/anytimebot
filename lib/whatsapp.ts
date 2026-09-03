
import { prisma } from '@/lib/db';

interface WhatsAppSendOptions {
  userId: string;
  to: string;
  message: string;
  bookingId?: string;
}

/**
 * Unified WhatsApp message sender that works with Evolution API or Twilio
 * based on user's configuration
 */
export async function sendWhatsAppMessage(options: WhatsAppSendOptions): Promise<boolean> {
  const { userId, to, message, bookingId } = options;

  try {
    // Get user's WhatsApp configuration
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        whatsappEnabled: true,
        whatsappProvider: true,
        whatsappPhone: true,
        // Evolution API
        evolutionApiUrl: true,
        evolutionApiKey: true,
        evolutionInstanceName: true,
        // Twilio
        twilioAccountSid: true,
        twilioAuthToken: true,
        twilioPhoneNumber: true,
      },
    });

    if (!user || !user.whatsappEnabled) {
      console.log('WhatsApp not enabled for user');
      return false;
    }

    // Use the configured provider
    if (user.whatsappProvider === 'twilio') {
      return await sendViaTwilio(user, to, message, userId, bookingId);
    } else {
      return await sendViaEvolution(user, to, message, userId, bookingId);
    }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return false;
  }
}

/**
 * Send message via Evolution API
 */
async function sendViaEvolution(
  user: any,
  to: string,
  message: string,
  userId: string,
  bookingId?: string
): Promise<boolean> {
  if (!user.evolutionApiUrl || !user.evolutionApiKey || !user.evolutionInstanceName) {
    console.log('Evolution API not configured');
    return false;
  }

  try {
    const response = await fetch(
      `${user.evolutionApiUrl}/message/sendText/${user.evolutionInstanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': user.evolutionApiKey,
        },
        body: JSON.stringify({
          number: to.replace(/[^0-9]/g, ''), // Remove non-numeric characters
          text: message,
        }),
      }
    );

    if (!response.ok) {
      console.error('Evolution API error:', await response.text());
      return false;
    }

    const data = await response.json();

    // Save message to database
    await prisma.whatsAppMessage.create({
      data: {
        userId: userId,
        bookingId: bookingId,
        phone: to,
        message: message,
        direction: 'OUTGOING',
        status: 'SENT',
        provider: 'evolution',
        evolutionId: data.key?.id || null,
      },
    });

    return true;
  } catch (error) {
    console.error('Error sending via Evolution API:', error);
    return false;
  }
}

/**
 * Send message via Twilio
 */
async function sendViaTwilio(
  user: any,
  to: string,
  message: string,
  userId: string,
  bookingId?: string
): Promise<boolean> {
  if (!user.twilioAccountSid || !user.twilioAuthToken || !user.twilioPhoneNumber) {
    console.log('Twilio not configured');
    return false;
  }

  try {
    // Format phone numbers for WhatsApp
    const fromNumber = user.twilioPhoneNumber.startsWith('whatsapp:') 
      ? user.twilioPhoneNumber 
      : `whatsapp:${user.twilioPhoneNumber}`;
    
    const toNumber = to.startsWith('whatsapp:') 
      ? to 
      : `whatsapp:${to}`;

    // Send message via Twilio API
    const authHeader = Buffer.from(
      `${user.twilioAccountSid}:${user.twilioAuthToken}`
    ).toString('base64');

    const formData = new URLSearchParams();
    formData.append('From', fromNumber);
    formData.append('To', toNumber);
    formData.append('Body', message);

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${user.twilioAccountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    if (!response.ok) {
      console.error('Twilio API error:', await response.text());
      return false;
    }

    const data = await response.json();

    // Save message to database
    await prisma.whatsAppMessage.create({
      data: {
        userId: userId,
        bookingId: bookingId,
        phone: toNumber,
        message: message,
        direction: 'OUTGOING',
        status: 'SENT',
        provider: 'twilio',
        twilioSid: data.sid,
      },
    });

    return true;
  } catch (error) {
    console.error('Error sending via Twilio:', error);
    return false;
  }
}

/**
 * Send booking confirmation via WhatsApp
 */
export async function sendBookingConfirmation(
  userId: string,
  to: string,
  bookingData: {
    guestName: string;
    eventTypeName: string;
    startTime: string;
    timezone: string;
    cancelUrl?: string;
    rescheduleUrl?: string;
  }
): Promise<boolean> {
  const manageBlock =
    bookingData.cancelUrl || bookingData.rescheduleUrl
      ? `\n\n🔧 ¿Necesitas modificar o cancelar tu cita?\n${bookingData.rescheduleUrl ? `🔄 Reprogramar: ${bookingData.rescheduleUrl}\n` : ''}${bookingData.cancelUrl ? `❌ Cancelar: ${bookingData.cancelUrl}` : ''}`
      : '';

  const message = `¡Hola ${bookingData.guestName}! 👋

Tu reunión ha sido confirmada:
📅 Tipo: ${bookingData.eventTypeName}
🕐 Fecha y hora: ${bookingData.startTime}
🌍 Zona horaria: ${bookingData.timezone}${manageBlock}

¡Te esperamos!`;

  return await sendWhatsAppMessage({
    userId,
    to,
    message,
  });
}

/**
 * Send booking reminder via WhatsApp
 */
export async function sendBookingReminder(
  userId: string,
  to: string,
  bookingData: {
    guestName: string;
    eventTypeName: string;
    startTime: string;
    meetingLink?: string;
  }
): Promise<boolean> {
  const linkText = bookingData.meetingLink 
    ? `\n🔗 Link de la reunión: ${bookingData.meetingLink}` 
    : '';

  const message = `¡Recordatorio! 🔔

Hola ${bookingData.guestName}, tu reunión es pronto:
📅 ${bookingData.eventTypeName}
🕐 ${bookingData.startTime}${linkText}

¡Nos vemos pronto!`;

  return await sendWhatsAppMessage({
    userId,
    to,
    message,
  });
}

/**
 * Send booking cancellation via WhatsApp
 */
export async function sendBookingCancellation(
  userId: string,
  to: string,
  bookingData: {
    guestName: string;
    eventTypeName: string;
    startTime: string;
  }
): Promise<boolean> {
  const message = `Hola ${bookingData.guestName},

Tu reunión del ${bookingData.startTime} (${bookingData.eventTypeName}) ha sido cancelada.

Si necesitas reagendar, no dudes en contactarnos.`;

  return await sendWhatsAppMessage({
    userId,
    to,
    message,
  });
}

/**
 * Convert the AI-generated Markdown summary into WhatsApp-flavored plain
 * text: headings become bold lines, bullets become `•`, and code/link
 * markers are stripped so the text renders cleanly in WhatsApp.
 */
export function formatSummaryForWhatsApp(summary: string): string {
  const lines = summary.split('\n').map((line) => line.trimEnd());
  const cleaned = lines
    .map((line) => {
      if (/^#{1,6}\s+/.test(line)) return `*${line.replace(/^#{1,6}\s+/, '')}*`;
      if (/^[-*]\s+/.test(line)) return `• ${line.replace(/^[-*]\s+/, '')}`;
      return line;
    })
    .filter((line, index, arr) => !(line.trim() === '' && (index === 0 || arr[index - 1].trim() === '')));
  return cleaned
    .join('\n')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/__([^_]+)__/g, '_$1_')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/**
 * Build the guest-facing WhatsApp message sent when the host marks the
 * meeting as finished. Only the freshly generated summary is included — the
 * host's private notes are never shared. Kept short when there is no summary.
 */
export function buildPostMeetingWhatsAppMessage(data: {
  guestName: string;
  eventTitle: string;
  startTime: string;
  summary?: string | null;
  bookingUrl?: string;
}): string {
  const { guestName, eventTitle, startTime, summary, bookingUrl } = data;
  const greeting = `¡Hola ${guestName}! 👋`;
  const meetingLine = `Gracias por tu reunión "${eventTitle}" (${startTime}).`;

  let body: string;
  if (summary && summary.trim()) {
    body = `${greeting}\n\n${meetingLine}\n\n📝 *Resumen de la reunión:*\n${formatSummaryForWhatsApp(summary)}`;
  } else {
    body = `${greeting}\n\n${meetingLine}\n\n¡Esperamos que haya sido muy productiva!`;
  }

  const cta = bookingUrl ? `\n\n📅 ¿Quieres agendar otra reunión?\n${bookingUrl}` : '';
  const message = `${body}${cta}`;

  // WhatsApp text messages are capped (~4096 chars); keep the CTA intact and
  // truncate the summary body when needed.
  if (message.length > 4000) {
    const budget = Math.max(600, 4000 - cta.length - 1);
    return `${body.slice(0, budget).trimEnd()}…${cta}`;
  }
  return message;
}

/**
 * Send the post-meeting thank-you + summary via WhatsApp from the tenant's
 * connected number.
 */
export async function sendMeetingSummary(
  userId: string,
  to: string,
  data: {
    guestName: string;
    eventTitle: string;
    startTime: string;
    summary?: string | null;
    bookingUrl?: string;
  }
): Promise<boolean> {
  return await sendWhatsAppMessage({
    userId,
    to,
    message: buildPostMeetingWhatsAppMessage(data),
  });
}
