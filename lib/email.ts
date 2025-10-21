
// Email utility functions

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send email using Resend API
 */
export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  try {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey || apiKey === 're_placeholder') {
      console.error('Resend API key not configured');
      return false;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'ANYTIMEBOT <noreply@anytimebot.app>',
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Email sending failed:', error);
      return false;
    }

    const result = await response.json();
    console.log('Email sent successfully:', result);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Format date with timezone
 */
function formatDateWithTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    timeZoneName: 'short',
    timeZone: timezone,
  }).format(date);
}

/**
 * Send booking confirmation email
 */
export async function sendBookingConfirmation(data: {
  to: string;
  guestName: string;
  eventTitle: string;
  startTime: Date;
  duration: number;
  location: string;
  videoLink?: string;
  timezone?: string;
  bookingId?: string;
  cancelToken?: string;
  rescheduleToken?: string;
  meetingPageUrl?: string;
}): Promise<boolean> {
  const { to, guestName, eventTitle, startTime, duration, location, videoLink, timezone = 'UTC', bookingId, cancelToken, rescheduleToken, meetingPageUrl } = data;
  
  const formattedDate = formatDateWithTimezone(startTime, timezone);

  // Create cancel and reschedule links
  const baseUrl = process.env.NEXTAUTH_URL || 'https://anytimebot.app';
  const cancelUrl = cancelToken ? `${baseUrl}/booking/cancel?token=${cancelToken}` : null;
  const rescheduleUrl = rescheduleToken ? `${baseUrl}/booking/reschedule?token=${rescheduleToken}` : null;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #00BFFF; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">¡Reserva Confirmada! 🎉</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${guestName},</p>
          
          <p style="font-size: 16px; color: #555;">Tu reserva ha sido confirmada exitosamente. Aquí están los detalles:</p>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
            <h2 style="margin-top: 0; color: white; font-size: 24px;">${eventTitle}</h2>
            <div style="margin: 15px 0; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.3); border-bottom: 1px solid rgba(255,255,255,0.3);">
              <p style="margin: 8px 0;"><strong>📅 Cuándo:</strong> ${formattedDate}</p>
              <p style="margin: 8px 0;"><strong>⏱️ Duración:</strong> ${duration} minutos</p>
              <p style="margin: 8px 0;"><strong>🌍 Zona horaria:</strong> ${timezone}</p>
              <p style="margin: 8px 0;"><strong>📍 Ubicación:</strong> ${location}</p>
              ${videoLink ? `<p style="margin: 8px 0;"><strong>🎥 Enlace de video:</strong> <a href="${videoLink}" style="color: #FFD700; text-decoration: underline;">${videoLink}</a></p>` : ''}
            </div>
          </div>
          
          ${meetingPageUrl ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${meetingPageUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);">
              🎥 Unirse a la Sala de Reunión
            </a>
            <p style="margin-top: 10px; color: #6b7280; font-size: 14px;">Accede a la sala inteligente con briefing y contexto</p>
          </div>
          ` : ''}
          
          ${cancelUrl || rescheduleUrl ? `
          <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #00BFFF;">
            <h3 style="margin-top: 0; color: #333;">¿Necesitas hacer cambios?</h3>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${rescheduleUrl ? `
              <a href="${rescheduleUrl}" style="display: inline-block; padding: 12px 24px; background-color: #00BFFF; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px 5px 5px 0;">
                🔄 Reprogramar
              </a>
              ` : ''}
              ${cancelUrl ? `
              <a href="${cancelUrl}" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px 0;">
                ❌ Cancelar
              </a>
              ` : ''}
            </div>
          </div>
          ` : ''}
          
          <div style="margin-top: 30px; padding: 20px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; color: #1e40af; font-weight: 500;">
              💡 <strong>Tip:</strong> Recibirás un recordatorio automático 24 horas antes de tu cita.
            </p>
          </div>
          
          <p style="font-size: 16px; margin-top: 30px;">¡Nos vemos pronto! 👋</p>
          
          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
              © 2024 <strong>ANYTIMEBOT</strong>
            </p>
            <p style="color: #9ca3af; font-size: 13px; margin: 5px 0;">
              Agendamiento inteligente hecho simple
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `✅ Reserva Confirmada: ${eventTitle}`,
    html,
  });
}

/**
 * Send booking reminder email (24 hours before)
 */
export async function sendBookingReminder(data: {
  to: string;
  guestName: string;
  eventTitle: string;
  startTime: Date;
  videoLink?: string;
  location?: string;
  timezone?: string;
  cancelToken?: string;
  rescheduleToken?: string;
}): Promise<boolean> {
  const { to, guestName, eventTitle, startTime, videoLink, location, timezone = 'UTC', cancelToken, rescheduleToken } = data;
  
  const formattedDate = formatDateWithTimezone(startTime, timezone);

  // Create cancel and reschedule links
  const baseUrl = process.env.NEXTAUTH_URL || 'https://anytimebot.app';
  const cancelUrl = cancelToken ? `${baseUrl}/booking/cancel?token=${cancelToken}` : null;
  const rescheduleUrl = rescheduleToken ? `${baseUrl}/booking/reschedule?token=${rescheduleToken}` : null;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Recordatorio de Reunión ⏰</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${guestName},</p>
          
          <p style="font-size: 16px; color: #555;">Este es un recordatorio amigable de que tienes una reunión programada para mañana:</p>
          
          <div style="background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
            <h2 style="margin-top: 0; color: white; font-size: 24px;">${eventTitle}</h2>
            <div style="margin: 15px 0; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.3); border-bottom: 1px solid rgba(255,255,255,0.3);">
              <p style="margin: 8px 0;"><strong>📅 Cuándo:</strong> ${formattedDate}</p>
              <p style="margin: 8px 0;"><strong>🌍 Zona horaria:</strong> ${timezone}</p>
              ${location ? `<p style="margin: 8px 0;"><strong>📍 Ubicación:</strong> ${location}</p>` : ''}
              ${videoLink ? `<p style="margin: 15px 0 0 0;"><strong>🎥 Enlace de video:</strong><br><a href="${videoLink}" style="color: #FFD700; text-decoration: underline; font-size: 15px; word-break: break-all;">${videoLink}</a></p>` : ''}
            </div>
          </div>
          
          ${cancelUrl || rescheduleUrl ? `
          <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <h3 style="margin-top: 0; color: #333;">¿Necesitas hacer cambios?</h3>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${rescheduleUrl ? `
              <a href="${rescheduleUrl}" style="display: inline-block; padding: 12px 24px; background-color: #00BFFF; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px 5px 5px 0;">
                🔄 Reprogramar
              </a>
              ` : ''}
              ${cancelUrl ? `
              <a href="${cancelUrl}" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px 0;">
                ❌ Cancelar
              </a>
              ` : ''}
            </div>
          </div>
          ` : ''}
          
          <div style="margin-top: 30px; padding: 20px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-weight: 500;">
              ⚠️ <strong>Importante:</strong> Asegúrate de probar tu conexión de video antes de la reunión.
            </p>
          </div>
          
          <p style="font-size: 16px; margin-top: 30px;">¡Nos vemos pronto! 👋</p>
          
          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
              © 2024 <strong>ANYTIMEBOT</strong>
            </p>
            <p style="color: #9ca3af; font-size: 13px; margin: 5px 0;">
              Agendamiento inteligente hecho simple
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `⏰ Recordatorio: ${eventTitle} es mañana`,
    html,
  });
}

/**
 * Send booking cancellation email
 */
export async function sendBookingCancellation(data: {
  to: string;
  guestName: string;
  eventTitle: string;
  startTime: Date;
  timezone?: string;
}): Promise<boolean> {
  const { to, guestName, eventTitle, startTime, timezone = 'UTC' } = data;
  
  const formattedDate = formatDateWithTimezone(startTime, timezone);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Reserva Cancelada</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${guestName},</p>
          
          <p style="font-size: 16px; color: #555;">Tu reserva ha sido cancelada exitosamente:</p>
          
          <div style="background-color: #fee2e2; padding: 25px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #dc2626;">
            <h2 style="margin-top: 0; color: #991b1b; font-size: 24px;">${eventTitle}</h2>
            <p style="margin: 8px 0; color: #7f1d1d;"><strong>📅 Fecha cancelada:</strong> ${formattedDate}</p>
            <p style="margin: 8px 0; color: #7f1d1d;"><strong>🌍 Zona horaria:</strong> ${timezone}</p>
          </div>
          
          <p style="font-size: 16px; margin-top: 30px;">Si deseas agendar una nueva cita, no dudes en contactarnos.</p>
          
          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
              © 2024 <strong>ANYTIMEBOT</strong>
            </p>
            <p style="color: #9ca3af; font-size: 13px; margin: 5px 0;">
              Agendamiento inteligente hecho simple
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `❌ Reserva Cancelada: ${eventTitle}`,
    html,
  });
}

/**
 * Send booking reschedule email
 */
export async function sendBookingReschedule(data: {
  to: string;
  guestName: string;
  eventTitle: string;
  oldStartTime: Date;
  newStartTime: Date;
  duration: number;
  location: string;
  videoLink?: string;
  timezone?: string;
  cancelToken?: string;
  rescheduleToken?: string;
}): Promise<boolean> {
  const { to, guestName, eventTitle, oldStartTime, newStartTime, duration, location, videoLink, timezone = 'UTC', cancelToken, rescheduleToken } = data;
  
  const oldFormattedDate = formatDateWithTimezone(oldStartTime, timezone);
  const newFormattedDate = formatDateWithTimezone(newStartTime, timezone);

  // Create cancel and reschedule links
  const baseUrl = process.env.NEXTAUTH_URL || 'https://anytimebot.app';
  const cancelUrl = cancelToken ? `${baseUrl}/booking/cancel?token=${cancelToken}` : null;
  const rescheduleUrl = rescheduleToken ? `${baseUrl}/booking/reschedule?token=${rescheduleToken}` : null;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #3b82f6; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Reserva Reprogramada 🔄</h1>
        </div>
        
        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${guestName},</p>
          
          <p style="font-size: 16px; color: #555;">Tu reserva ha sido reprogramada exitosamente.</p>
          
          <div style="background-color: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <p style="margin: 0; color: #991b1b;"><strong>❌ Fecha anterior:</strong> ${oldFormattedDate}</p>
          </div>
          
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
            <h2 style="margin-top: 0; color: white; font-size: 24px;">${eventTitle}</h2>
            <div style="margin: 15px 0; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.3); border-bottom: 1px solid rgba(255,255,255,0.3);">
              <p style="margin: 8px 0;"><strong>✅ Nueva fecha:</strong> ${newFormattedDate}</p>
              <p style="margin: 8px 0;"><strong>⏱️ Duración:</strong> ${duration} minutos</p>
              <p style="margin: 8px 0;"><strong>🌍 Zona horaria:</strong> ${timezone}</p>
              <p style="margin: 8px 0;"><strong>📍 Ubicación:</strong> ${location}</p>
              ${videoLink ? `<p style="margin: 8px 0;"><strong>🎥 Enlace de video:</strong> <a href="${videoLink}" style="color: #FFD700; text-decoration: underline;">${videoLink}</a></p>` : ''}
            </div>
          </div>
          
          ${cancelUrl || rescheduleUrl ? `
          <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <h3 style="margin-top: 0; color: #333;">¿Necesitas hacer más cambios?</h3>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
              ${rescheduleUrl ? `
              <a href="${rescheduleUrl}" style="display: inline-block; padding: 12px 24px; background-color: #00BFFF; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px 5px 5px 0;">
                🔄 Reprogramar Otra Vez
              </a>
              ` : ''}
              ${cancelUrl ? `
              <a href="${cancelUrl}" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 5px 0;">
                ❌ Cancelar
              </a>
              ` : ''}
            </div>
          </div>
          ` : ''}
          
          <p style="font-size: 16px; margin-top: 30px;">¡Nos vemos pronto! 👋</p>
          
          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
              © 2024 <strong>ANYTIMEBOT</strong>
            </p>
            <p style="color: #9ca3af; font-size: 13px; margin: 5px 0;">
              Agendamiento inteligente hecho simple
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `🔄 Reserva Reprogramada: ${eventTitle}`,
    html,
  });
}
