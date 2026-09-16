import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { sendSystemWhatsAppMessage } from '@/lib/system-whatsapp';
import { generateBookingToken } from '@/lib/booking-tokens';
import { window24h, window1h, window24hDaily } from '@/lib/reminder-windows';

export const dynamic = 'force-dynamic';

/**
 * Cron job: send WhatsApp reminders for upcoming bookings (day-before and 1h).
 *
 * Vercel Hobby only allows DAILY schedules, so the day-before query uses the
 * 24h-wide daily sweep (window24hDaily): every booking is caught by exactly
 * one run and reminded 12–36h ahead. Set REMINDER_HOURLY=1 on a Pro account
 * to use the tighter ±60min window around T−24h. The 1h reminder keeps its
 * tight window anchored to "now": on a daily schedule it therefore only
 * reaches bookings starting within the hour after that run — full 1h coverage
 * requires the hourly cadence. Either way the per-booking flags keep each
 * reminder at most once, and they flip only after a successful send so
 * transient failures are retried.
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

    // === DAY-BEFORE REMINDERS ===
    // Bookings starting in the sweep window (12–36h ahead, or ±1h around
    // T−24h when REMINDER_HOURLY=1) not yet reminded.
    const { from: from24h, to: in24h } = process.env.REMINDER_HOURLY === '1'
      ? window24h(now)
      : window24hDaily(now);

    const bookings24h = await prisma.booking.findMany({
      where: {
        startTime: {
          gte: from24h,
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

      const message = `📅 *Recordatorio de cita*

Hola ${booking.guestName}, te recordamos tu cita:

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

      // Flag only on success so a failed send is retried on the next run.
      if (sent) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminder24hSent: true },
        });
        totalSent++;
        console.log(`[WhatsApp Reminders] 24h reminder sent for booking ${booking.id}`);
      } else {
        totalFailed++;
        console.log(`[WhatsApp Reminders] Failed to send 24h reminder for booking ${booking.id}`);
      }
    }

    // === 1-HOUR REMINDERS ===
    // Bookings starting within the hour (plus a small past grace) not yet reminded.
    const { from: in50m, to: in1h } = window1h(now);

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

      // Flag only on success so a failed send is retried on the next run.
      if (sent) {
        await prisma.booking.update({
          where: { id: booking.id },
          data: { reminder1hSent: true },
        });
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
