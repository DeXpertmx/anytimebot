
// Email utility functions

import { prisma } from '@/lib/db';
import { sendMail } from '@/lib/mailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Get email template for user
 */
export async function getEmailTemplate(userId: string, type: string): Promise<{ subject: string; htmlBody: string } | null> {
  try {
    const template = await prisma.emailTemplate.findFirst({
      where: {
        userId,
        type,
        isActive: true,
      },
    });

    if (!template) {
      return null;
    }

    return {
      subject: template.subject,
      htmlBody: template.htmlBody,
    };
  } catch (error) {
    console.error('Error fetching email template:', error);
    return null;
  }
}

/**
 * Replace template variables with actual values
 */
export function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\{\{${key}\}\}`, 'g'), value);
  }
  return result;
}

/**
 * Low-level send through the active provider (SMTP preferred, Resend fallback).
 * Returns the provider message id on success so callers can log it for
 * traceability (e.g. membership welcome emails).
 */
async function sendEmailRaw({ to, subject, html }: EmailOptions): Promise<{ ok: boolean; resendId?: string }> {
  const result = await sendMail({ to, subject, html });
  if (result.ok) {
    return { ok: true, resendId: result.id };
  }
  return { ok: false };
}

/**
 * Send email using Resend API
 */
export async function sendEmail({ to, subject, html }: EmailOptions): Promise<boolean> {
  const { ok } = await sendEmailRaw({ to, subject, html });
  return ok;
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://anytimebot.app';
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
 * Send booking confirmation email with custom template support
 */
export async function sendBookingConfirmationWithTemplate(data: {
  userId: string;
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
  const { userId, to, guestName, eventTitle, startTime, duration, location, videoLink, timezone = 'UTC', bookingId, cancelToken, rescheduleToken, meetingPageUrl } = data;
  
  // Try to get custom template
  const template = await getEmailTemplate(userId, 'confirmation');
  
  if (template) {
    const formattedDate = formatDateWithTimezone(startTime, timezone);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://anytimebot.app';
    const cancelUrl = cancelToken ? `${baseUrl}/booking/cancel?token=${cancelToken}` : '';
    const rescheduleUrl = rescheduleToken ? `${baseUrl}/booking/reschedule?token=${rescheduleToken}` : '';
    
    const variables = {
      guestName,
      eventTitle,
      startTime: formattedDate,
      duration: duration.toString(),
      location,
      videoLink: videoLink || '',
      timezone,
      cancelUrl,
      rescheduleUrl,
      meetingPageUrl: meetingPageUrl || '',
      bookingId: bookingId || '',
    };
    
    const html = replaceTemplateVariables(template.htmlBody, variables);
    const subject = replaceTemplateVariables(template.subject, variables);
    
    return sendEmail({ to, subject, html });
  }
  
  // Fall back to default template
  return sendBookingConfirmation(data);
}

/**
 * Send membership welcome email when a client subscribes to a recurring
 * event type (membership). Includes the price, billing frequency and the
 * next renewal date.
 */
export async function sendMembershipWelcome(data: {
  to: string;
  customerName: string;
  eventTitle: string;
  price: number;
  currency: string;
  interval: string;
  nextChargeDate?: Date | null;
  bookingPageTitle?: string;
  portalUrl?: string | null;
}): Promise<boolean> {
  const {
    to,
    customerName,
    eventTitle,
    price,
    currency,
    interval,
    nextChargeDate,
    bookingPageTitle,
    portalUrl,
  } = data;

  const fmtPrice = new Intl.NumberFormat('es', {
    style: 'currency',
    currency: currency?.toUpperCase() || 'EUR',
  }).format(price / 100);
  const intervalLabel =
    interval === 'year' ? 'año' : 'mes';
  const nextCharge = nextChargeDate
    ? new Intl.DateTimeFormat('es', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(nextChargeDate)
    : null;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #00BFFF; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">¡Bienvenido a tu membresía! 🎉</h1>
        </div>

        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${customerName},</p>

          <p style="font-size: 16px; color: #555;">
            Tu suscripción se ha activado correctamente. Aquí tienes los detalles:
          </p>

          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
            <h2 style="margin-top: 0; color: white; font-size: 24px;">${eventTitle}</h2>
            <div style="margin: 15px 0; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.3); border-bottom: 1px solid rgba(255,255,255,0.3);">
              <p style="margin: 8px 0;"><strong>💰 Importe:</strong> ${fmtPrice} / ${intervalLabel}</p>
              ${bookingPageTitle ? `<p style="margin: 8px 0;"><strong>📋 Servicio:</strong> ${bookingPageTitle}</p>` : ''}
              ${nextCharge ? `<p style="margin: 8px 0;"><strong>📅 Próximo cobro:</strong> ${nextCharge}</p>` : ''}
            </div>
          </div>

          <div style="margin-top: 30px; padding: 20px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <p style="margin: 0; color: #1e40af; font-weight: 500;">
              💡 <strong>Recuerda:</strong> tu suscripción se renovará automáticamente cada ${intervalLabel === 'año' ? 'año' : 'mes'} hasta que la canceles.
            </p>
          </div>

          ${portalUrl ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${portalUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);">
              🔧 Gestionar mi suscripción
            </a>
            <p style="margin-top: 10px; color: #6b7280; font-size: 14px;">
              Puedes ver tu facturación, actualizar tu método de pago o cancelar la suscripción cuando quieras.
            </p>
          </div>
          ` : ''}

          <p style="font-size: 16px; margin-top: 30px;">¡Gracias por confiar en nosotros! 👋</p>

          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
              © ${new Date().getFullYear()} <strong>ANYTIMEBOT</strong>
            </p>
            <p style="color: #9ca3af; font-size: 13px; margin: 5px 0;">
              Agendamiento inteligente hecho simple
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const { ok, resendId } = await sendEmailRaw({
    to,
    subject: `🎉 Suscripción activada: ${eventTitle}`,
    html,
  });

  if (ok) {
    console.log(
      `[membership-welcome] email sent to=${to} event="${eventTitle}" price=${fmtPrice} ${intervalLabel} resendId=${resendId}`,
    );
  } else {
    console.error(`[membership-welcome] email FAILED to=${to} event="${eventTitle}"`);
  }

  return ok;
}

/**
 * Send membership overdue email when a client's recurring subscription period
 * ended without a successful renewal. Warns that the membership will be
 * cancelled after the grace period (default 30 days) unless renewed.
 */
export async function sendMembershipOverdue(data: {
  to: string;
  customerName: string;
  eventTitle: string;
  price: number;
  currency: string;
  interval: string;
  periodEnded?: Date | null;
  graceDays?: number;
  bookingPageTitle?: string;
}): Promise<boolean> {
  const {
    to,
    customerName,
    eventTitle,
    price,
    currency,
    interval,
    periodEnded,
    graceDays = 30,
    bookingPageTitle,
  } = data;

  const fmtPrice = new Intl.NumberFormat('es', {
    style: 'currency',
    currency: currency?.toUpperCase() || 'EUR',
  }).format(price / 100);
  const intervalLabel = interval === 'year' ? 'año' : 'mes';

  // The membership would be cancelled graceDays after the period ended.
  const cancelDate = periodEnded
    ? new Date(periodEnded.getTime() + graceDays * 24 * 60 * 60 * 1000)
    : null;
  const cancelDateLabel = cancelDate
    ? new Intl.DateTimeFormat('es', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(cancelDate)
    : null;
  const periodEndedLabel = periodEnded
    ? new Intl.DateTimeFormat('es', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(periodEnded)
    : null;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Tu suscripción está pendiente de pago ⚠️</h1>
        </div>

        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${customerName},</p>

          <p style="font-size: 16px; color: #555;">
            No hemos podido renovar tu suscripción. Aquí tienes los detalles:
          </p>

          <div style="background: linear-gradient(135deg, #f59e0b 0%, #dc2626 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
            <h2 style="margin-top: 0; color: white; font-size: 24px;">${eventTitle}</h2>
            <div style="margin: 15px 0; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.3); border-bottom: 1px solid rgba(255,255,255,0.3);">
              <p style="margin: 8px 0;"><strong>💰 Importe:</strong> ${fmtPrice} / ${intervalLabel}</p>
              ${bookingPageTitle ? `<p style="margin: 8px 0;"><strong>📋 Servicio:</strong> ${bookingPageTitle}</p>` : ''}
              ${periodEndedLabel ? `<p style="margin: 8px 0;"><strong>📅 Periodo finalizado:</strong> ${periodEndedLabel}</p>` : ''}
            </div>
          </div>

          <div style="margin-top: 30px; padding: 20px; background-color: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-weight: 500;">
              ⚠️ <strong>Importante:</strong>${cancelDateLabel ? ` Tu suscripción se cancelará el <strong>${cancelDateLabel}</strong> si no se renueva.` : ` Tu suscripción se cancelará en ${graceDays} días si no se renueva.`} Ponte en contacto con el proveedor del servicio para actualizar tu método de pago.
            </p>
          </div>

          <p style="font-size: 16px; margin-top: 30px;">Si ya realizaste el pago, ignora este mensaje. 🙌</p>

          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
              © ${new Date().getFullYear()} <strong>ANYTIMEBOT</strong>
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
    subject: `⚠️ Renovación pendiente: ${eventTitle}`,
    html,
  });
}

/**
 * Very small, safe Markdown → HTML converter used for the AI meeting summary
 * inside emails. It escapes first, then renders headings, lists and bold text.
 * It is intentionally conservative (no raw HTML passthrough).
 */
function markdownToHtml(markdown: string): string {
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  const lines = escaped.split('\n');
  const html: string[] = [];
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 1, 4);
      html.push(`<h${level} style="color: #1f2937; margin: 18px 0 6px; font-size: ${level <= 2 ? 17 : 15}px;">${heading[2]}</h${level}>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (!listOpen) {
        html.push('<ul style="margin: 8px 0 12px; padding-left: 20px;">');
        listOpen = true;
      }
      html.push(`<li style="margin: 4px 0;">${line.replace(/^\s*[-*]\s+/, '')}</li>`);
      continue;
    }
    closeList();
    if (line.trim() === '') continue;
    html.push(`<p style="margin: 6px 0; color: #4b5563;">${line}</p>`);
  }
  closeList();
  return html.join('\n');
}

/**
 * Send the guest a thank-you email with the AI meeting summary when the host
 * marks the appointment as finished. Only the freshly generated summary is
 * included — the host's private notes are never sent to the guest.
 */
export async function sendPostMeetingSummary(data: {
  userId: string;
  to: string;
  guestName: string;
  hostName?: string | null;
  eventTitle: string;
  startTime: Date;
  timezone?: string;
  summary?: string | null;
  bookingUrl?: string;
}): Promise<boolean> {
  const {
    userId,
    to,
    guestName,
    hostName,
    eventTitle,
    startTime,
    timezone = 'UTC',
    summary,
    bookingUrl,
  } = data;

  const formattedDate = formatDateWithTimezone(startTime, timezone);
  const summaryHtml = summary ? markdownToHtml(summary) : '';

  // Custom template support (type: post_meeting)
  const template = await getEmailTemplate(userId, 'post_meeting');
  if (template) {
    const variables = {
      guestName,
      hostName: hostName || '',
      eventTitle,
      startTime: formattedDate,
      timezone,
      summary: summary || '',
      summaryHtml,
      bookingUrl: bookingUrl || '',
    };
    const html = replaceTemplateVariables(template.htmlBody, variables);
    const subject = replaceTemplateVariables(template.subject, variables);
    return sendEmail({ to, subject, html });
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 26px;">¡Gracias por tu reunión! 🎉</h1>
        </div>

        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${guestName},</p>

          <p style="font-size: 16px; color: #555;">
            Ha sido un placer reunirnos contigo. Aquí tienes un resumen de la reunión <strong>${eventTitle}</strong> (${formattedDate}):
          </p>

          ${summaryHtml ? `
          <div style="margin: 25px 0; padding: 20px; background-color: #f9fafb; border-radius: 10px; border: 1px solid #e5e7eb;">
            ${summaryHtml}
          </div>
          ` : ''}

          ${hostName ? `<p style="font-size: 16px;">Un saludo,<br><strong>${hostName}</strong></p>` : `<p style="font-size: 16px;">Un saludo,<br><strong>ANYTIMEBOT</strong></p>`}

          ${bookingUrl ? `
          <div style="text-align: center; margin: 30px 0;">
            <a href="${bookingUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);">
              📅 Agendar otra reunión
            </a>
          </div>
          ` : ''}

          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">
              © ${new Date().getFullYear()} <strong>ANYTIMEBOT</strong>
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
    subject: `📝 Gracias por tu reunión: ${eventTitle}`,
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://anytimebot.app';
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
 * Send booking reminder email with custom template support
 */
export async function sendBookingReminderWithTemplate(data: {
  userId: string;
  to: string;
  guestName: string;
  eventTitle: string;
  startTime: Date;
  videoLink?: string;
  location?: string;
  timezone?: string;
  cancelToken?: string;
  rescheduleToken?: string;
  hoursBefore?: number;
}): Promise<boolean> {
  const { userId, to, guestName, eventTitle, startTime, videoLink, location, timezone = 'UTC', cancelToken, rescheduleToken, hoursBefore = 24 } = data;
  
  // Try to get custom template
  const templateType = hoursBefore === 1 ? 'reminder_1h' : 'reminder_24h';
  const template = await getEmailTemplate(userId, templateType);
  
  if (template) {
    const formattedDate = formatDateWithTimezone(startTime, timezone);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://anytimebot.app';
    const cancelUrl = cancelToken ? `${baseUrl}/booking/cancel?token=${cancelToken}` : '';
    const rescheduleUrl = rescheduleToken ? `${baseUrl}/booking/reschedule?token=${rescheduleToken}` : '';
    
    const variables = {
      guestName,
      eventTitle,
      startTime: formattedDate,
      location: location || '',
      videoLink: videoLink || '',
      timezone,
      cancelUrl,
      rescheduleUrl,
      hoursBefore: hoursBefore.toString(),
    };
    
    const html = replaceTemplateVariables(template.htmlBody, variables);
    const subject = replaceTemplateVariables(template.subject, variables);
    
    return sendEmail({ to, subject, html });
  }
  
  // Fall back to default template
  return sendBookingReminder(data);
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
 * Cancellation of a recurring series: lists the cancelled future dates.
 */
export async function sendSeriesCancellation(data: {
  to: string;
  guestName: string;
  eventTitle: string;
  startTimes: Date[];
  timezone?: string;
}): Promise<boolean> {
  const { to, guestName, eventTitle, startTimes, timezone = 'UTC' } = data;

  const rows = startTimes
    .map(
      (d) =>
        `<li style="margin:4px 0;color:#7f1d1d;">📅 ${formatDateWithTimezone(d, timezone)}</li>`
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Serie de Reservas Cancelada</h1>
        </div>

        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${guestName},</p>

          <p style="font-size: 16px; color: #555;">Tu serie de citas recurrentes de <strong>${eventTitle}</strong> ha sido cancelada. Las siguientes fechas quedan canceladas:</p>

          <ul style="background-color: #fee2e2; padding: 25px 25px 25px 45px; border-radius: 12px; margin: 25px 0; border-left: 4px solid #dc2626; list-style: none;">${rows}</ul>

          <p style="font-size: 16px; color: #555;">Las citas que ya se realizaron no se ven afectadas.</p>

          <div style="text-align: center; margin: 35px 0;">
            <p style="font-size: 14px; color: #888; margin: 0;">Agendamiento inteligente hecho simple</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `❌ Serie Cancelada: ${eventTitle}`,
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.NEXTAUTH_URL || 'https://anytimebot.app';
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

/**
 * Notify the host when a new booking requires their confirmation.
 * The host approves it from the dashboard (bookings list / calendar).
 */
export async function sendHostBookingApprovalRequest(data: {
  userId: string;
  to: string;
  hostName?: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  eventTitle: string;
  startTime: Date;
  timezone?: string;
  dashboardUrl: string;
}): Promise<boolean> {
  const {
    userId,
    to,
    hostName,
    guestName,
    guestEmail,
    guestPhone,
    eventTitle,
    startTime,
    timezone = 'UTC',
    dashboardUrl,
  } = data;

  const template = await getEmailTemplate(userId, 'booking_request');
  if (template) {
    const variables = {
      hostName: hostName || '',
      guestName,
      guestEmail,
      guestPhone: guestPhone || '',
      eventTitle,
      startTime: formatDateWithTimezone(startTime, timezone),
      dashboardUrl,
    };
    const html = replaceTemplateVariables(template.htmlBody, variables);
    const subject = replaceTemplateVariables(template.subject, variables);
    return sendEmail({ to, subject, html });
  }

  const formattedDate = formatDateWithTimezone(startTime, timezone);
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
        <div style="background-color: #f59e0b; color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Nueva solicitud de reserva ⏳</h1>
        </div>

        <div style="background-color: white; padding: 40px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <p style="font-size: 18px; margin-top: 0;">Hola ${hostName || 'tu'},</p>

          <p style="font-size: 16px; color: #555;">
            Has recibido una nueva solicitud de reserva que está pendiente de tu confirmación:
          </p>

          <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 25px; border-radius: 12px; margin: 25px 0; color: white;">
            <h2 style="margin-top: 0; color: white; font-size: 24px;">${eventTitle}</h2>
            <div style="margin: 15px 0; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.3); border-bottom: 1px solid rgba(255,255,255,0.3);">
              <p style="margin: 8px 0;"><strong>👤 Cliente:</strong> ${guestName} (${guestEmail})${guestPhone ? ` · ${guestPhone}` : ''}</p>
              <p style="margin: 8px 0;"><strong>📅 Fecha:</strong> ${formattedDate}</p>
              <p style="margin: 8px 0;"><strong>🌍 Zona horaria:</strong> ${timezone}</p>
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="display: inline-block; padding: 16px 32px; background: #f59e0b; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              ✅ Ver y aprobar en el panel
            </a>
            <p style="margin-top: 10px; color: #6b7280; font-size: 14px;">
              Puedes confirmar o cancelar la reserva desde Reservas o el Calendario.
            </p>
          </div>

          <p style="font-size: 16px; margin-top: 30px;">Un saludo,</p>
          <p style="font-size: 16px;">El equipo de ANYTIMEBOT</p>

          <div style="margin-top: 40px; padding-top: 25px; border-top: 2px solid #e5e7eb; text-align: center;">
            <p style="color: #6b7280; font-size: 14px; margin: 5px 0;">© ${new Date().getFullYear()} <strong>ANYTIMEBOT</strong></p>
          </div>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to,
    subject: `⏳ Solicitud de reserva: ${eventTitle}`,
    html,
  });
}
