
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateMeetingBriefings } from '@/lib/briefing-generator';
import { sendEmail } from '@/lib/email';
import { sendWhatsAppMessage } from '@/lib/evolution-api';

export const dynamic = 'force-dynamic';

/**
 * Cron job to generate and send meeting briefings 1 hour before bookings
 * This should be called every 10-15 minutes by a cron service
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

    // Calculate time window: 50-70 minutes from now (target: 1 hour)
    const now = new Date();
    const in50Minutes = new Date(now.getTime() + 50 * 60 * 1000);
    const in70Minutes = new Date(now.getTime() + 70 * 60 * 1000);

    // Find bookings in the time window that don't have briefings yet
    const bookings = await prisma.booking.findMany({
      where: {
        startTime: {
          gte: in50Minutes,
          lte: in70Minutes,
        },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: true,
              },
            },
          },
        },
        assignedMember: true,
      },
    });

    console.log(`Found ${bookings.length} bookings to send briefings for`);

    const results = await Promise.allSettled(
      bookings.map(async (booking) => {
        try {
          // Check if briefing already exists
          const existingBriefing = await prisma.meetingBriefing.findFirst({
            where: { bookingId: booking.id },
          });

          let briefing = existingBriefing;

          // Generate briefing if it doesn't exist
          if (!briefing) {
            console.log(`Generating briefing for booking ${booking.id}`);
            const result = await generateMeetingBriefings(booking.id);

            if (!result.success) {
              throw new Error(`Failed to generate briefing: ${result.error}`);
            }

            briefing = await prisma.meetingBriefing.findFirst({
              where: { bookingId: booking.id },
            });

            if (!briefing) {
              throw new Error('Briefing not found after generation');
            }
          }

          // Skip if already sent
          if (briefing.emailSent && briefing.whatsappSent) {
            console.log(`Briefing already sent for booking ${booking.id}`);
            return { success: true, bookingId: booking.id, skipped: true };
          }

          const host = booking.assignedMember || booking.eventType.bookingPage.user;
          const baseUrl = process.env.NEXTAUTH_URL || 'https://anytimebot.app';

          // Send guest briefing via email
          if (!briefing.emailSent) {
            const guestEmailSent = await sendEmail({
              to: booking.guestEmail,
              subject: `Your upcoming meeting: ${booking.eventType.name}`,
              html: `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background: linear-gradient(135deg, #00BFFF 0%, #0099CC 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
                      .content { background: white; padding: 30px; border-radius: 0 0 12px 12px; }
                      .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
                      a { color: #00BFFF; text-decoration: none; }
                      .button { display: inline-block; background: #00BFFF; color: white !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 10px 5px; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>🎯 Pre-Meeting Brief</h1>
                        <p>Get ready for your upcoming meeting</p>
                      </div>
                      <div class="content">
                        ${briefing.guestBriefing}
                        
                        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                        
                        <p style="text-align: center;">
                          <a href="${baseUrl}/booking/cancel?id=${booking.id}" class="button">Reschedule</a>
                        </p>
                      </div>
                      <div class="footer">
                        <p>Powered by <strong>ANYTIMEBOT</strong></p>
                        <p><a href="${baseUrl}">anytimebot.app</a></p>
                      </div>
                    </div>
                  </body>
                </html>
              `,
            });

            if (guestEmailSent) {
              console.log(`Guest briefing email sent for booking ${booking.id}`);
            }
          }

          // Send host briefing via email
          if (!briefing.emailSent) {
            const hostEmailSent = await sendEmail({
              to: host.email,
              subject: `Meeting brief: ${booking.guestName} - ${booking.eventType.name}`,
              html: `
                <!DOCTYPE html>
                <html>
                  <head>
                    <meta charset="utf-8">
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0; }
                      .content { background: white; padding: 30px; border-radius: 0 0 12px 12px; }
                      .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
                      a { color: #6366f1; text-decoration: none; }
                      .badge { display: inline-block; background: #f0f9ff; color: #0369a1; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>📋 Meeting Intelligence Brief</h1>
                        <p>Prepare for your upcoming meeting</p>
                      </div>
                      <div class="content">
                        ${briefing.hostBriefing}
                        
                        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                        
                        <p style="text-align: center; color: #666; font-size: 14px;">
                          View full details in your <a href="${baseUrl}/dashboard/bookings">dashboard</a>
                        </p>
                      </div>
                      <div class="footer">
                        <p>Powered by <strong>ANYTIMEBOT</strong></p>
                      </div>
                    </div>
                  </body>
                </html>
              `,
            });

            if (hostEmailSent) {
              console.log(`Host briefing email sent for booking ${booking.id}`);
            }
          }

          // Send guest briefing via WhatsApp (if enabled and phone available)
          let whatsappSent = false;
          if (!briefing.whatsappSent && booking.guestPhone) {
            const user = await prisma.user.findUnique({
              where: { id: host.id },
              select: {
                whatsappEnabled: true,
                evolutionApiUrl: true,
                evolutionApiKey: true,
                evolutionInstanceName: true,
              },
            });

            if (
              user?.whatsappEnabled &&
              user.evolutionApiUrl &&
              user.evolutionApiKey &&
              user.evolutionInstanceName
            ) {
              // Strip HTML tags for WhatsApp text
              const plainTextBriefing = briefing.guestBriefing
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .trim();

              const whatsappMessage = `🎯 *Pre-Meeting Brief*

${plainTextBriefing}

Need to reschedule? Reply "CHANGE" and we'll help you find a better time.

_Powered by ANYTIMEBOT_`;

              const result = await sendWhatsAppMessage({
                credentials: {
                  apiUrl: user.evolutionApiUrl,
                  apiKey: user.evolutionApiKey,
                  instanceName: user.evolutionInstanceName,
                },
                number: booking.guestPhone,
                text: whatsappMessage,
              });

              whatsappSent = result.success;
              if (whatsappSent) {
                console.log(`Guest briefing WhatsApp sent for booking ${booking.id}`);
              }
            }
          }

          // Update briefing status
          await prisma.meetingBriefing.update({
            where: { id: briefing.id },
            data: {
              emailSent: true,
              whatsappSent: whatsappSent || briefing.whatsappSent,
              sentAt: new Date(),
            },
          });

          return { success: true, bookingId: booking.id };
        } catch (error) {
          console.error(`Failed to send briefing for booking ${booking.id}:`, error);
          return { success: false, bookingId: booking.id, error };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success && !(r.value as any).skipped).length;
    const skipped = results.filter(r => r.status === 'fulfilled' && (r.value as any).skipped).length;
    const failed = results.length - successful - skipped;

    return NextResponse.json({
      success: true,
      data: {
        total: bookings.length,
        successful,
        skipped,
        failed,
      },
    });
  } catch (error) {
    console.error('Error in send-briefings cron job:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

