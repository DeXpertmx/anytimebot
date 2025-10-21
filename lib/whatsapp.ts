
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
  }
): Promise<boolean> {
  const message = `¡Hola ${bookingData.guestName}! 👋

Tu reunión ha sido confirmada:
📅 Tipo: ${bookingData.eventTypeName}
🕐 Fecha y hora: ${bookingData.startTime}
🌍 Zona horaria: ${bookingData.timezone}

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
