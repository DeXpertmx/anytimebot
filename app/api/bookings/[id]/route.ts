
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { sendBookingCancellation } from '@/lib/evolution-api';
import {
  sendBookingCancellation as sendCancellationEmail,
  sendBookingConfirmationWithTemplate,
  sendPostMeetingSummary,
} from '@/lib/email';
import {
  sendBookingConfirmation as sendWhatsAppBookingConfirmation,
  sendMeetingSummary as sendWhatsAppMeetingSummary,
} from '@/lib/whatsapp';
import {
  notifyAdminBookingCancelled,
  sendSystemBookingConfirmation,
  sendSystemMeetingSummary,
} from '@/lib/system-whatsapp';
import { notifyBookingCancelled } from '@/lib/push-notifications';
import { generateBookingToken } from '@/lib/booking-tokens';
import { getPublicAppUrl } from '@/lib/public-url';
import { generateMeetingSummary } from '@/lib/meeting-summary';
import { dispatchWebhookEvent, buildBookingPayload, type WebhookEvent } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

// GET /api/bookings/[id] - Get a specific booking
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: params.id,
        eventType: {
          bookingPage: {
            userId: (session.user as any).id,
          },
        },
      },
      include: {
        eventType: {
          include: {
            bookingPage: {
              include: {
                user: true,
              },
            },
            formFields: true,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error('Error fetching booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/bookings/[id] - Update booking status and/or host notes.
// Accepts CONFIRMED | CANCELLED | COMPLETED | PENDING. Guest notifications
// (email/WhatsApp) are only sent when the status actually changes, so saving
// notes or re-saving the same state never re-notifies.
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { status, notes } = body;

    if ((!status || !['CONFIRMED', 'CANCELLED', 'PENDING', 'COMPLETED'].includes(status)) && notes === undefined) {
      return NextResponse.json(
        { success: false, error: 'Invalid payload' },
        { status: 400 }
      );
    }

    if (status && !['CONFIRMED', 'CANCELLED', 'PENDING', 'COMPLETED'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status' },
        { status: 400 }
      );
    }

    // Check if booking belongs to user
    const existingBooking = await prisma.booking.findFirst({
      where: {
        id: params.id,
        eventType: {
          bookingPage: {
            userId: (session.user as any).id,
          },
        },
      },
    });

    if (!existingBooking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    const prevStatus = existingBooking.status;
    const nextStatus = (status as string) || prevStatus;

    // A meeting can only be marked as finished if it was pending/confirmed;
    // cancelling after it was already finished is not allowed.
    if (nextStatus === 'COMPLETED' && prevStatus !== 'COMPLETED' && !['CONFIRMED', 'PENDING'].includes(prevStatus)) {
      return NextResponse.json(
        { success: false, error: 'Solo se puede finalizar una cita confirmada o pendiente' },
        { status: 400 }
      );
    }
    if (nextStatus === 'CANCELLED' && prevStatus === 'COMPLETED') {
      return NextResponse.json(
        { success: false, error: 'No se puede cancelar una cita ya finalizada' },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (status) data.status = nextStatus;
    if (notes !== undefined) data.notes = notes === '' || notes === null ? null : String(notes);
    if (nextStatus === 'COMPLETED' && prevStatus !== 'COMPLETED') data.completedAt = new Date();
    if (prevStatus === 'COMPLETED' && nextStatus !== 'COMPLETED') data.completedAt = null;

    const statusChanged = prevStatus !== nextStatus;

    let updatedBooking = await prisma.booking.update({
      where: { id: params.id },
      data: data as any,
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
      },
    });

    // When the meeting is marked as finished for the first time, generate an
    // AI summary (OrcaRouter → DeepSeek), save it into the booking notes and
    // email the guest a thank-you message with that summary. Best-effort: a
    // failure here must never break the finalization.
    let generatedSummary: string | null = null;
    if (nextStatus === 'COMPLETED' && statusChanged) {
      try {
        const { summary, skipped } = await generateMeetingSummary(params.id);
        if (!skipped && summary) {
          generatedSummary = summary;
          updatedBooking = { ...updatedBooking, notes: summary };
        }
      } catch (summaryError) {
        console.error('Failed to generate meeting summary:', summaryError);
      }
    }

    const ownerUser = updatedBooking.eventType?.bookingPage?.user ?? null;
    const baseUrl = getPublicAppUrl();

    // Thank-you email to the guest with the meeting summary once the host
    // marks the appointment as finished. Only the generated summary is shared
    // — the host's private notes are never sent.
    if (nextStatus === 'COMPLETED' && statusChanged) {
      const bookingPage = updatedBooking.eventType?.bookingPage;
      const owner = bookingPage?.user;
      const bookingUrl =
        owner?.username && bookingPage?.slug
          ? `${baseUrl}/${owner.username}/${bookingPage.slug}`
          : undefined;
      try {
        await sendPostMeetingSummary({
          userId: owner?.id ?? '',
          to: updatedBooking.guestEmail,
          guestName: updatedBooking.guestName,
          hostName: owner?.name,
          eventTitle: updatedBooking.eventType.name,
          startTime: updatedBooking.startTime,
          timezone: updatedBooking.timezone,
          summary: generatedSummary,
          bookingUrl,
        });
      } catch (emailError) {
        console.error('Failed to send post-meeting summary email:', emailError);
      }

      // Also thank the guest by WhatsApp with the meeting summary. Tries the
      // tenant's connected number first and falls back to the Anytimebot
      // notification number. Only the generated summary is shared.
      if (updatedBooking.guestPhone) {
        const formattedStart = updatedBooking.startTime.toLocaleString('es-ES', {
          timeZone: updatedBooking.timezone,
        });
        try {
          const sent = await sendWhatsAppMeetingSummary(
            owner?.id ?? '',
            updatedBooking.guestPhone,
            {
              guestName: updatedBooking.guestName,
              eventTitle: updatedBooking.eventType.name,
              startTime: formattedStart,
              summary: generatedSummary,
              bookingUrl,
            },
          );
          if (!sent) {
            await sendSystemMeetingSummary(updatedBooking.guestPhone, {
              guestName: updatedBooking.guestName,
              eventTitle: updatedBooking.eventType.name,
              startTime: formattedStart,
              summary: generatedSummary,
              bookingUrl,
            });
          }
        } catch (whatsappError) {
          console.error('Failed to send WhatsApp meeting summary:', whatsappError);
        }
      }
    }

    // When the host confirms a booking, notify the guest by email and WhatsApp
    // with the details plus links to reschedule/cancel (only on a real change).
    if (nextStatus === 'CONFIRMED' && statusChanged) {
      const cancelToken = generateBookingToken(updatedBooking.id, 'cancel');
      const rescheduleToken = generateBookingToken(updatedBooking.id, 'reschedule');

      let meetingPageUrl: string | undefined;
      try {
        const vs = await prisma.videoSession.findUnique({ where: { bookingId: updatedBooking.id } });
        if (vs) meetingPageUrl = `${baseUrl}/meeting/${updatedBooking.id}`;
      } catch {
        // Best-effort
      }

      try {
        await sendBookingConfirmationWithTemplate({
          userId: ownerUser?.id ?? '',
          to: updatedBooking.guestEmail,
          guestName: updatedBooking.guestName,
          eventTitle: updatedBooking.eventType.name,
          startTime: updatedBooking.startTime,
          duration: updatedBooking.eventType.duration,
          location: updatedBooking.eventType.location,
          videoLink: updatedBooking.eventType.videoLink || undefined,
          timezone: updatedBooking.timezone,
          bookingId: updatedBooking.id,
          cancelToken,
          rescheduleToken,
          meetingPageUrl,
        });
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }

      if (updatedBooking.guestPhone) {
        const cancelUrl = `${baseUrl}/booking/cancel?token=${cancelToken}`;
        const rescheduleUrl = `${baseUrl}/booking/reschedule?token=${rescheduleToken}`;
        try {
          const sent = await sendWhatsAppBookingConfirmation(
            ownerUser?.id ?? '',
            updatedBooking.guestPhone,
            {
              guestName: updatedBooking.guestName,
              eventTypeName: updatedBooking.eventType.name,
              startTime: updatedBooking.startTime.toLocaleString('es-ES', { timeZone: updatedBooking.timezone }),
              timezone: updatedBooking.timezone,
              cancelUrl,
              rescheduleUrl,
            },
          );
          if (!sent) {
            await sendSystemBookingConfirmation(updatedBooking.guestPhone, {
              guestName: updatedBooking.guestName,
              eventTypeName: updatedBooking.eventType.name,
              startTime: updatedBooking.startTime.toLocaleString('es-ES', { timeZone: updatedBooking.timezone }),
              timezone: updatedBooking.timezone,
              cancelUrl,
              rescheduleUrl,
            });
          }
        } catch (whatsappError) {
          console.error('Failed to send WhatsApp confirmation:', whatsappError);
        }
      }
    }

    // Notify the guest by email when the host cancels a booking (real change only).
    if (nextStatus === 'CANCELLED' && statusChanged) {
      try {
        await sendCancellationEmail({
          to: updatedBooking.guestEmail,
          guestName: updatedBooking.guestName,
          eventTitle: updatedBooking.eventType.name,
          startTime: updatedBooking.startTime,
          timezone: updatedBooking.timezone,
        });
      } catch (emailError) {
        console.error('Failed to send cancellation email:', emailError);
      }
    }

    // Send WhatsApp cancellation if booking is cancelled and user has WhatsApp enabled
    if (nextStatus === 'CANCELLED' && statusChanged && updatedBooking.guestPhone) {
      const user = await prisma.user.findUnique({
        where: { id: updatedBooking.eventType.bookingPage.user.id },
        select: {
          id: true,
          whatsappEnabled: true,
          evolutionApiUrl: true,
          evolutionApiKey: true,
          evolutionInstanceName: true,
        },
      });

      if (user?.whatsappEnabled && user.evolutionApiUrl && user.evolutionApiKey && user.evolutionInstanceName) {
        try {
          const credentials = {
            apiUrl: user.evolutionApiUrl,
            apiKey: user.evolutionApiKey,
            instanceName: user.evolutionInstanceName,
          };

          await sendBookingCancellation(credentials, {
            guestName: updatedBooking.guestName,
            guestPhone: updatedBooking.guestPhone,
            eventName: updatedBooking.eventType.name,
            startTime: updatedBooking.startTime,
          });

          // Store the message in database
          await prisma.whatsAppMessage.create({
            data: {
              userId: user.id,
              bookingId: updatedBooking.id,
              phone: updatedBooking.guestPhone,
              message: `Cancelación de reserva para ${updatedBooking.eventType.name}`,
              direction: 'OUTGOING',
              status: 'SENT',
            },
          });
        } catch (whatsappError) {
          console.error('Failed to send WhatsApp cancellation:', whatsappError);
          // Don't fail the update if WhatsApp fails
        }
      }
    }

    if (nextStatus === 'CANCELLED' && statusChanged) {
      try {
        await notifyBookingCancelled(
          updatedBooking.eventType.bookingPage.user.id,
          updatedBooking.guestName,
          updatedBooking.eventType.name,
          updatedBooking.id,
        );
      } catch (pushError) {
        console.error('Failed to notify booking cancelled:', pushError);
      }

      // Notify the Anytimebot admin of the cancellation via the system WhatsApp number.
      try {
        await notifyAdminBookingCancelled({
          guestName: updatedBooking.guestName,
          guestEmail: updatedBooking.guestEmail,
          guestPhone: updatedBooking.guestPhone,
          eventTypeName: updatedBooking.eventType.name,
          startTime: updatedBooking.startTime,
          timezone: updatedBooking.timezone,
        });
      } catch (adminError) {
        console.error('Failed to notify admin of cancellation:', adminError);
      }
    }

    // Outgoing webhook for external integrations on any real status change
    // (best-effort, persisted first). PENDING transitions are ignored because
    // they are internal states, not meaningful for external platforms.
    if (statusChanged) {
      const eventByStatus: Partial<Record<string, WebhookEvent>> = {
        CONFIRMED: 'booking.confirmed',
        CANCELLED: 'booking.cancelled',
        COMPLETED: 'booking.completed',
      };
      const webhookEvent = eventByStatus[nextStatus];
      const webhookOwner = updatedBooking.eventType?.bookingPage?.user;
      if (webhookEvent && webhookOwner) {
        await dispatchWebhookEvent(webhookOwner.id, webhookEvent, buildBookingPayload(webhookEvent, updatedBooking));
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedBooking,
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/bookings/[id] - Cancel/Delete a booking
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if booking belongs to user
    const existingBooking = await prisma.booking.findFirst({
      where: {
        id: params.id,
        eventType: {
          bookingPage: {
            userId: (session.user as any).id,
          },
        },
      },
    });

    if (!existingBooking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Instead of deleting, we'll mark as cancelled
    const cancelledBooking = await prisma.booking.update({
      where: { id: params.id },
      data: { status: 'CANCELLED' },
    });

    // Notify the dashboard user via Web Push (best-effort).
    try {
      const owner = await prisma.eventType.findUnique({
        where: { id: cancelledBooking.eventTypeId },
        select: { bookingPage: { select: { userId: true } } },
      });
      if (owner?.bookingPage.userId) {
        await notifyBookingCancelled(
          owner.bookingPage.userId,
          cancelledBooking.guestName,
          'Reserva',
          cancelledBooking.id,
        );
      }
    } catch {
      // Best-effort; never fail the cancellation.
    }

    // Notify the Anytimebot admin of the cancellation via the system WhatsApp number.
    try {
      const ev = await prisma.eventType.findUnique({
        where: { id: cancelledBooking.eventTypeId },
        select: { name: true },
      });
      await notifyAdminBookingCancelled({
        guestName: cancelledBooking.guestName,
        guestEmail: cancelledBooking.guestEmail,
        guestPhone: cancelledBooking.guestPhone,
        eventTypeName: ev?.name || 'Reserva',
        startTime: cancelledBooking.startTime,
        timezone: cancelledBooking.timezone,
      });
    } catch {
      // Best-effort; never fail the cancellation.
    }

    // Outgoing webhook for external integrations (best-effort, persisted first).
    try {
      const et = await prisma.eventType.findUnique({
        where: { id: cancelledBooking.eventTypeId },
        include: { bookingPage: { select: { id: true, title: true, slug: true, userId: true } } },
      });
      if (et) {
        await dispatchWebhookEvent(
          et.bookingPage.userId,
          'booking.cancelled',
          buildBookingPayload('booking.cancelled', { ...cancelledBooking, eventType: et }),
        );
      }
    } catch {
      // Best-effort; never fail the cancellation.
    }

    return NextResponse.json({
      success: true,
      data: cancelledBooking,
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
