import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { feedbackToken } from '@/app/api/feedback/route';

export const dynamic = 'force-dynamic';

/**
 * Cron job: send post-booking feedback surveys.
 * Finds confirmed bookings that ended between 2 and 26 hours ago without
 * feedback and emails the guest a survey link (one attempt per booking —
 * the feedback record itself is the dedup marker).
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

    // Confirmed bookings that ended 2-26h ago, guest has no feedback yet
    const bookings = await prisma.booking.findMany({
      where: {
        endTime: { gte: twentySixHoursAgo, lte: twoHoursAgo },
        status: 'CONFIRMED',
        guestEmail: { not: '' },
        feedback: null,
      },
      include: {
        eventType: { select: { name: true } },
      },
      take: 200,
    });

    if (bookings.length === 0) {
      return NextResponse.json({ success: true, data: { sent: 0 } });
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://anytimebot.app';
    let sent = 0;

    for (const booking of bookings) {
      const token = feedbackToken(booking.id);
      const surveyUrl = `${baseUrl}/feedback/${booking.id}?t=${token}`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1e293b; margin-bottom: 8px;">¿Cómo fue tu experiencia?</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6;">
            Hola ${booking.guestName}, gracias por tu cita <strong>${booking.eventType.name}</strong>.
            Tu opinión es muy importante para nosotros: ¿nos regalas 30 segundos para contarnos cómo te fue?
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${surveyUrl}"
               style="background-color: #4f46e5; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 15px; display: inline-block;">
              Dejar mi opinión
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 12px;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
            <a href="${surveyUrl}" style="color: #6366f1; word-break: break-all;">${surveyUrl}</a>
          </p>
        </div>`;

      const ok = await sendEmail({
        to: booking.guestEmail,
        subject: '¿Cómo fue tu experiencia? Tu opinión nos importa',
        html,
      });
      if (ok) sent++;
    }

    return NextResponse.json({ success: true, data: { found: bookings.length, sent } });
  } catch (error) {
    console.error('Error sending feedback surveys:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
