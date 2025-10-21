
// User-specific Evolution API credentials
export interface EvolutionCredentials {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

interface SendMessageParams {
  credentials: EvolutionCredentials;
  number: string;
  text: string;
}

interface SendMediaParams {
  credentials: EvolutionCredentials;
  number: string;
  mediaUrl: string;
  caption?: string;
}

/**
 * Send a text message via WhatsApp
 */
export async function sendWhatsAppMessage({ credentials, number, text }: SendMessageParams) {
  try {
    const response = await fetch(`${credentials.apiUrl}/message/sendText/${credentials.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': credentials.apiKey,
      },
      body: JSON.stringify({
        number: formatPhoneNumber(number),
        text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Send a media message via WhatsApp
 */
export async function sendWhatsAppMedia({ credentials, number, mediaUrl, caption }: SendMediaParams) {
  try {
    const response = await fetch(`${credentials.apiUrl}/message/sendMedia/${credentials.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': credentials.apiKey,
      },
      body: JSON.stringify({
        number: formatPhoneNumber(number),
        mediaUrl,
        caption,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error sending WhatsApp media:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get instance connection status
 */
export async function getInstanceStatus(credentials: EvolutionCredentials) {
  try {
    console.log('Checking status for instance:', credentials.instanceName);
    console.log('API URL:', credentials.apiUrl);
    
    const response = await fetch(`${credentials.apiUrl}/instance/connectionState/${credentials.instanceName}`, {
      method: 'GET',
      headers: {
        'apikey': credentials.apiKey,
      },
    });

    console.log('Status response:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Status error:', errorText);
      throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Status data:', data);
    
    // Evolution API returns state like "open", "close", "connecting"
    const isConnected = data.state === 'open' || data.instance?.state === 'open';
    
    return { 
      success: true, 
      connected: isConnected,
      state: data.state || data.instance?.state || 'unknown',
      data 
    };
  } catch (error) {
    console.error('Error getting instance status:', error);
    return { 
      success: false, 
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

/**
 * Format phone number for WhatsApp (removes + and spaces)
 */
function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let formatted = phone.replace(/[^\d+]/g, '');
  
  // Remove + if present
  if (formatted.startsWith('+')) {
    formatted = formatted.substring(1);
  }
  
  // Add @s.whatsapp.net suffix if not present
  if (!formatted.includes('@')) {
    formatted = `${formatted}@s.whatsapp.net`;
  }
  
  return formatted;
}

/**
 * Send booking confirmation via WhatsApp
 */
export async function sendBookingConfirmation(
  credentials: EvolutionCredentials,
  booking: {
    guestName: string;
    guestPhone: string;
    eventName: string;
    startTime: Date;
    endTime: Date;
    timezone: string;
  }
) {
  const message = `🎉 *Confirmación de Reserva - ANYTIMEBOT*

Hola ${booking.guestName},

Tu reserva ha sido confirmada exitosamente.

📅 *Detalles de la reunión:*
• Evento: ${booking.eventName}
• Fecha: ${new Date(booking.startTime).toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}
• Hora: ${new Date(booking.startTime).toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })} - ${new Date(booking.endTime).toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })}
• Zona horaria: ${booking.timezone}

¡Nos vemos pronto! 👋

Si necesitas cancelar o reprogramar, por favor contáctanos.`;

  return sendWhatsAppMessage({
    credentials,
    number: booking.guestPhone,
    text: message,
  });
}

/**
 * Send booking reminder via WhatsApp
 */
export async function sendBookingReminder(
  credentials: EvolutionCredentials,
  booking: {
    guestName: string;
    guestPhone: string;
    eventName: string;
    startTime: Date;
  }
) {
  const message = `⏰ *Recordatorio - ANYTIMEBOT*

Hola ${booking.guestName},

Te recordamos que tienes una reunión programada:

📅 *${booking.eventName}*
Mañana a las ${new Date(booking.startTime).toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })}

¡No olvides asistir! 😊`;

  return sendWhatsAppMessage({
    credentials,
    number: booking.guestPhone,
    text: message,
  });
}

/**
 * Send booking cancellation via WhatsApp
 */
export async function sendBookingCancellation(
  credentials: EvolutionCredentials,
  booking: {
    guestName: string;
    guestPhone: string;
    eventName: string;
    startTime: Date;
  }
) {
  const message = `❌ *Cancelación de Reserva - ANYTIMEBOT*

Hola ${booking.guestName},

Tu reserva ha sido cancelada:

📅 *${booking.eventName}*
Fecha: ${new Date(booking.startTime).toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  })}

Si deseas reprogramar, por favor contáctanos.

¡Gracias! 👋`;

  return sendWhatsAppMessage({
    credentials,
    number: booking.guestPhone,
    text: message,
  });
}
