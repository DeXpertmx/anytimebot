import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { sendSystemWhatsAppMessage } from '@/lib/system-whatsapp';
import { generateBookingToken } from '@/lib/booking-tokens';

export const dynamic = 'force-dynamic';

/**
 * Cron job to send WhatsApp reminders for upcoming bookings
 * 
 * Sends two reminders:
 * - 24 hours before the booking
 * - 1 hour before the booking
 * 
 * Call with: GET /api/cron/whatsapp-reminders
 * Header: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'dev-secret';
    
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date();
    let totalSent = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    // === 24-HOUR REMINDERS ===
    // Find bookings starting between 23h30m and 24h30m from now
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in23h30m = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);

    const bookings24h = await prisma.booking.findMany({
      where: {
        startTime: {
          gte: in23h30m,
          lte: in24h,
        },
        status: { in: ['CONFIRMED', 'PENDING'] },
        guestPhone: { not: null },
        reminder24hSent: false,
      },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: {
                  select: {
                    id: true,
                    whatsappEnabled: true,
                    whatsappProvider: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    console.log(`[WhatsApp Reminders] Found ${bookings24h.length} bookings for 24h reminders`);

    for (const booking of bookings24h) {
      const userId = booking.eventType.bookingPage.userId;
      const user = booking.eventType.bookingPage.user;

      if (!booking.guestPhone) {
        totalSkipped++;
        continue;
      }

      const startTimeFormatted = booking.startTime.toLocaleString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: booking.timezone,
      });

      const cancelToken = generateBookingToken(booking.id, 'cancel');
      const rescheduleToken = generateBookingToken(booking.id, 'reschedule');
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://anytimebot.app';

      const message = `📅 *Recordatorio de cita - 24 horas*

Hola ${booking.guestName}, te recordamos que tienes una cita programada para mañana:

🎯 *${booking.eventType.name}*
🕐 ${startTimeFormatted}
⏱️ Duración: ${booking.eventType.duration} minutos

${booking.eventType.videoLink ? `🔗 Link de la reunión: ${booking.eventType.videoLink}` : ''}

Si necesitas cancelar o reprogramar:
❌ Cancelar: ${baseUrl}/booking/${booking.id}/cancel?token=${cancelToken}
🔄 Reprogramar: ${baseUrl}/booking/${booking.id}/reschedule?token=${rescheduleToken}

¡Te esperamos! 🙌`;

      // Send from the business number when connected, otherwise fall back to the
      // Anytimebot notification number.
      let sent = false;
      if (user.whatsappEnabled) {
        sent = await sendWhatsAppMessage({
          userId,
          to: booking.guestPhone,
          message,
          bookingId: booking.id,
        });
      } else {
        sent = await sendSystemWhatsAppMessage(booking.guestPhone, message, booking.id);
      }

      // Update reminder status
      await prisma.booking.update({
        where: { id: booking.id },
        data: { reminder24hSent: true },
      });

      if (sent) {
        totalSent++;
        console.log(`[WhatsApp Reminders] 24h reminder sent for booking ${booking.id}`);
      } else {
        totalFailed++;
        console.log(`[WhatsApp Reminders] Failed to send 24h reminder for booking ${booking.id}`);
      }
    }

    // === 1-HOUR REMINDERS ===
    // Find bookings starting between 50m and 1h10m from now
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    const in50m = new Date(now.getTime() + 50 * 60 * 1000);

    const bookings1h = await prisma.booking.findMany({
      where: {
        startTime: {
          gte: in50m,
          lte: in1h,
        },
        status: { in: ['CONFIRMED', 'PENDING'] },
        guestPhone: { not: null },
        reminder1hSent: false,
      },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: {
                  select: {
                    id: true,
                    whatsappEnabled: true,
                    whatsappProvider: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    console.log(`[WhatsApp Reminders] Found ${bookings1h.length} bookings for 1h reminders`);

    for (const booking of bookings1h) {
      const userId = booking.eventType.bookingPage.userId;
      const user = booking.eventType.bookingPage.user;

      if (!booking.guestPhone) {
        totalSkipped++;
        continue;
      }

      const startTimeFormatted = booking.startTime.toLocaleString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: booking.timezone,
      });

      const cancelToken = generateBookingToken(booking.id, 'cancel');
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://anytimebot.app';

      const message = `⏰ *Recordatorio - 1 hora*

Hola ${booking.guestName}, tu cita comienza en 1 hora:

🎯 *${booking.eventType.name}*
🕐 ${startTimeFormatted}

${booking.eventType.videoLink ? `🔗 Link de la reunión: ${booking.eventType.videoLink}` : ''}

❌ Cancelar: ${baseUrl}/booking/${booking.id}/cancel?token=${cancelToken}

¡Nos vemos pronto! 👋`;

      let sent = false;
      if (user.whatsappEnabled) {
        sent = await sendWhatsAppMessage({
          userId,
          to: booking.guestPhone,
          message,
          bookingId: booking.id,
        });
      } else {
        sent = await sendSystemWhatsAppMessage(booking.guestPhone, message, booking.id);
      }

      // Update reminder status
      await prisma.booking.update({
        where: { id: booking.id },
        data: { reminder1hSent: true },
      });

      if (sent) {
        totalSent++;
        console.log(`[WhatsApp Reminders] 1h reminder sent for booking ${booking.id}`);
      } else {
        totalFailed++;
        console.log(`[WhatsApp Reminders] Failed to send 1h reminder for booking ${booking.id}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        reminders24h: bookings24h.length,
        reminders1h: bookings1h.length,
        totalSent,
        totalFailed,
        totalSkipped,
      },
    });
  } catch (error) {
    console.error('[WhatsApp Reminders] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
