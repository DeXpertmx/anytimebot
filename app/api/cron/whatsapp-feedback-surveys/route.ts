import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { sendSystemWhatsAppMessage } from '@/lib/system-whatsapp';
import { feedbackToken } from '@/lib/feedback-token';

export const dynamic = 'force-dynamic';

/**
 * Cron job: send post-booking feedback surveys via WhatsApp.
 * Finds confirmed bookings that ended between 2 and 26 hours ago without
 * feedback and sends the guest a WhatsApp survey link (one attempt per
 * booking — the feedback record itself is the dedup marker).
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET || 'dev-secret';

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twentySixHoursAgo = new Date(now.getTime() - 26 * 60 * 60 * 1000);

    const bookings = await prisma.booking.findMany({
      where: {
        endTime: { gte: twentySixHoursAgo, lte: twoHoursAgo },
        status: 'CONFIRMED',
        guestPhone: { not: null },
        feedback: null,
      },
      include: {
        eventType: {
          select: {
            name: true,
            bookingPage: {
              select: {
                userId: true,
                user: {
                  select: { whatsappEnabled: true },
                },
              },
            },
          },
        },
      },
      take: 200,
    });

    if (bookings.length === 0) {
      return NextResponse.json({ success: true, data: { sent: 0 } });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://anytimebot.app';
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const booking of bookings) {
      const userId = booking.eventType.bookingPage?.userId;
      const whatsappEnabled = booking.eventType.bookingPage?.user?.whatsappEnabled;

      if (!userId || !booking.guestPhone) {
        skipped++;
        continue;
      }

      const token = feedbackToken(booking.id);
      const surveyUrl = `${baseUrl}/feedback/${booking.id}?t=${token}`;

      const message = `⭐ *¿Cómo fue tu experiencia?*

Hola ${booking.guestName}, gracias por tu cita *${booking.eventType.name}*.

¿Nos regalas 30 segundos para contarnos cómo te fue? Tu opinión nos ayuda a mejorar:

${surveyUrl}

¡Gracias! 🙏`;

      // Send from the business number when connected, otherwise fall back to the
      // Anytimebot notification number.
      let ok = false;
      if (whatsappEnabled) {
        ok = await sendWhatsAppMessage({
          userId,
          to: booking.guestPhone,
          message,
          bookingId: booking.id,
        });
      } else {
        ok = await sendSystemWhatsAppMessage(booking.guestPhone, message, booking.id);
      }

      if (ok) {
        sent++;
      } else {
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      data: { found: bookings.length, sent, failed, skipped },
    });
  } catch (error) {
    console.error('[WhatsApp Feedback Surveys] Error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
