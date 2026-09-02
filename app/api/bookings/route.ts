
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isValidEmail, isValidPhone, addMinutes } from '@/lib/utils';
import { sendBookingConfirmationWithTemplate } from '@/lib/email';
import { sendBookingConfirmation as sendWhatsAppBookingConfirmation } from '@/lib/whatsapp';
import { sendSystemBookingConfirmation } from '@/lib/system-whatsapp';
import { createCalendarEvent, checkAvailability as checkCalendarAvailability } from '@/lib/google-calendar';
import { generateBookingToken } from '@/lib/booking-tokens';
import { assignTeamMember } from '@/lib/team-assignment';
import { createVideoSession } from '@/lib/video-session';
import { getPublicAppUrl } from '@/lib/public-url';
import { recordConsent } from '@/lib/consent';
import { upsertCustomerFromBooking } from '@/lib/crm';
import { notifyBookingCreated } from '@/lib/push-notifications';

export const dynamic = 'force-dynamic';

// GET /api/bookings - Get all bookings for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const guestEmail = searchParams.get('guestEmail');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');

    let where: any = {
      eventType: {
        bookingPage: {
          userId: (session.user as any).id,
        },
      },
    };

    if (status && status !== 'all') {
      where.status = status.toUpperCase();
    }

    if (guestEmail) {
      where.guestEmail = { equals: guestEmail, mode: 'insensitive' };
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
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
        orderBy: { startTime: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        bookings,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/bookings - Create a new booking
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      eventTypeId,
      guestName,
      guestEmail,
      guestPhone,
      startTime,
      timezone = 'UTC',
      formData = {},
      routingFormResponses = {},
    } = body;

    // Record the data subject's explicit consent to process their data for
    // the booking (GDPR Art. 7) BEFORE any data processing happens.
    try {
      await recordConsent(
        {
          purpose: 'booking',
          subjectEmail: guestEmail,
          tenantId: null, // resolved below once the owner is known
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          userAgent: request.headers.get('user-agent'),
        },
        true,
      );
    } catch (consentError) {
      console.error('Failed to record booking consent:', consentError);
    }

    // Validation
    if (!eventTypeId || !guestName || !guestEmail || !startTime) {
      return NextResponse.json(
        { success: false, error: 'Event type, guest name, email, and start time are required' },
        { status: 400 }
      );
    }

    if (!isValidEmail(guestEmail)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    if (guestPhone && !isValidPhone(guestPhone)) {
      return NextResponse.json(
        { success: false, error: 'Invalid phone number' },
        { status: 400 }
      );
    }

    // Get event type with booking page
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: {
        bookingPage: true,
        formFields: true,
        team: {
          include: {
            members: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    if (!eventType.bookingPage.isActive) {
      return NextResponse.json(
        { success: false, error: 'Booking page is not active' },
        { status: 400 }
      );
    }

    // Server-side validation of required custom form fields
    const missingRequired = (eventType.formFields || []).filter((f) => {
      const v = formData?.[f.id];
      return f.required && (v === undefined || v === null || v === '' || v === false);
    });
    if (missingRequired.length > 0) {
      return NextResponse.json(
        { success: false, error: `Missing required fields: ${missingRequired.map((f) => f.label).join(', ')}` },
        { status: 400 }
      );
    }

    // CRM: keep the guest's contact record up to date
    await upsertCustomerFromBooking(eventType.bookingPage.userId, {
      email: guestEmail,
      name: guestName,
      phone: guestPhone,
    });

    // Calculate end time
    const bookingStartTime = new Date(startTime);
    const bookingEndTime = addMinutes(bookingStartTime, eventType.duration);

    // Block bookings that fall inside the owner's time off (vacations / absences)
    const blockingTimeOff = await prisma.timeOff.findFirst({
      where: {
        userId: eventType.bookingPage.userId,
        start: { lte: bookingEndTime },
        end: { gte: bookingStartTime },
      },
    });

    if (blockingTimeOff) {
      return NextResponse.json(
        { success: false, error: 'The host is unavailable during the selected time' },
        { status: 409 }
      );
    }

    // Check for conflicts
    const conflictingBooking = await prisma.booking.findFirst({
      where: {
        eventTypeId,
        status: { in: ['CONFIRMED', 'PENDING'] },
        OR: [
          {
            startTime: { lte: bookingStartTime },
            endTime: { gt: bookingStartTime },
          },
          {
            startTime: { lt: bookingEndTime },
            endTime: { gte: bookingEndTime },
          },
          {
            startTime: { gte: bookingStartTime },
            endTime: { lte: bookingEndTime },
          },
        ],
      },
    });

    if (conflictingBooking) {
      return NextResponse.json(
        { success: false, error: 'Time slot is already booked' },
        { status: 409 }
      );
    }

    // Assign team member if this is a team event
    let assignedMemberId: string | null = null;
    if (eventType.teamId && eventType.assignmentMode !== 'individual') {
      try {
        const assignment = await assignTeamMember({
          eventTypeId,
          startTime: bookingStartTime,
          endTime: bookingEndTime,
          formData,
          routingFormResponses: Object.keys(routingFormResponses).length > 0 ? routingFormResponses : undefined,
        });

        if (assignment) {
          // For collective mode, assignment is an array; for others, it's a string
          if (Array.isArray(assignment)) {
            // For collective, use the first member (or you could store all members)
            assignedMemberId = assignment[0];
          } else {
            assignedMemberId = assignment;
          }
        }

        // If no member could be assigned, return error
        if (!assignedMemberId) {
          return NextResponse.json(
            { success: false, error: 'No team member available for the selected time slot' },
            { status: 409 }
          );
        }
      } catch (error) {
        console.error('Error assigning team member:', error);
        // Continue without assignment for now
      }
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        eventTypeId,
        guestName,
        guestEmail,
        guestPhone,
        startTime: bookingStartTime,
        endTime: bookingEndTime,
        timezone,
        status: eventType.requiresConfirmation ? 'PENDING' : 'CONFIRMED',
        formData,
        assignedMemberId,
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
      },
    });

    // Save routing form responses if provided
    if (eventType.enableRouting && eventType.formSchema && Object.keys(routingFormResponses).length > 0) {
      try {
        await prisma.routingFormResponse.create({
          data: {
            eventTypeId,
            bookingId: booking.id,
            responses: routingFormResponses,
          },
        });
      } catch (error) {
        console.error('Error saving routing form response:', error);
        // Continue even if routing response save fails
      }
    }

    // Create Google Calendar event if user has calendar sync enabled
    let googleCalendarEventId: string | undefined;
    const bookingOwner = await prisma.user.findUnique({
      where: { id: booking.eventType.bookingPage.userId },
      select: { 
        id: true, 
        calendarSyncEnabled: true,
        accounts: {
          where: { provider: 'google' },
          select: { access_token: true }
        }
      },
    });

    if (bookingOwner?.calendarSyncEnabled && bookingOwner.accounts.length > 0 && bookingOwner.accounts[0].access_token) {
      try {
        // Check calendar availability first
        const isAvailable = await checkCalendarAvailability(
          bookingOwner.id,
          bookingStartTime,
          bookingEndTime
        );

        if (isAvailable) {
          const calendarEvent = await createCalendarEvent(bookingOwner.id, {
            summary: `${eventType.name} - ${guestName}`,
            description: `Booking with ${guestName}\nEmail: ${guestEmail}${guestPhone ? `\nPhone: ${guestPhone}` : ''}`,
            location: eventType.location === 'video' && eventType.videoLink ? eventType.videoLink : eventType.location,
            conferenceData: eventType.videoProvider === 'GOOGLE_MEET' ? {
              createRequest: {
                requestId: `anytimebot-${booking.id}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' },
              },
            } : undefined,
            start: bookingStartTime,
            end: bookingEndTime,
            attendees: [guestEmail],
          });

          const generatedMeetUrl = eventType.videoProvider === 'GOOGLE_MEET'
            ? calendarEvent?.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri
            : undefined;

          if (generatedMeetUrl) {
            eventType.videoLink = generatedMeetUrl;
          }

          if (calendarEvent?.id) {
            googleCalendarEventId = calendarEvent.id;
            
            // Update booking with calendar event ID
            await prisma.booking.update({
              where: { id: booking.id },
              data: { googleCalendarEventId: calendarEvent.id },
            });
          }
        } else {
          console.warn('Time slot not available in Google Calendar, but proceeding with booking');
        }
      } catch (calendarError) {
        console.error('Failed to create Google Calendar event:', calendarError);
        // Don't fail the booking if calendar creation fails
      }
    }

    // Generate tokens for cancel and reschedule
    const cancelToken = generateBookingToken(booking.id, 'cancel');
    const rescheduleToken = generateBookingToken(booking.id, 'reschedule');

    // Create video session if event type uses embedded video or Daily.co
    let videoSession = null;
    if (eventType.videoProvider === 'DAILY' && eventType.enableEmbeddedVideo) {
      try {
        videoSession = await createVideoSession({
          bookingId: booking.id,
          provider: eventType.videoProvider,
          eventTypeConfig: {
            enableRecording: eventType.enableRecording,
            enableTranscription: eventType.enableTranscription,
            enableLiveAI: eventType.enableLiveAI,
          },
          meetingDetails: {
            title: eventType.name,
            startTime: bookingStartTime,
            guestName,
          },
        });
        console.log('Video session created:', videoSession.id);
      } catch (videoError) {
        console.error('Failed to create video session:', videoError);
        // Don't fail the booking if video session creation fails
      }
    }

    // Notify the guest only when the booking is actually confirmed. For event
    // types that require host confirmation the status is PENDING here, so the
    // guest receives the confirmation (with reschedule/cancel links) later when
    // the host confirms it from the dashboard.
    if (booking.status === 'CONFIRMED') {
      // Send confirmation email
      try {
        const baseUrl = getPublicAppUrl();
        const meetingPageUrl = videoSession ? `${baseUrl}/meeting/${booking.id}` : undefined;

        await sendBookingConfirmationWithTemplate({
          userId: booking.eventType.bookingPage.userId,
          to: guestEmail,
          guestName,
          eventTitle: eventType.name,
          startTime: bookingStartTime,
          duration: eventType.duration,
          location: eventType.location,
          videoLink: eventType.videoLink || undefined,
          timezone,
          bookingId: booking.id,
          cancelToken,
          rescheduleToken,
          meetingPageUrl,
        });
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
        // Don't fail the booking if email fails
      }

      // Send WhatsApp notification if guest has phone
      if (guestPhone && booking.eventType.bookingPage.userId) {
        const appBaseUrl = getPublicAppUrl();
        const cancelUrl = `${appBaseUrl}/booking/cancel?token=${cancelToken}`;
        const rescheduleUrl = `${appBaseUrl}/booking/reschedule?token=${rescheduleToken}`;
        try {
          const sent = await sendWhatsAppBookingConfirmation(
            booking.eventType.bookingPage.userId,
            guestPhone,
            {
              guestName,
              eventTypeName: eventType.name,
              startTime: bookingStartTime.toLocaleString('es-ES', { timeZone: timezone }),
              timezone,
              cancelUrl,
              rescheduleUrl,
            }
          );

          // Fallback: when the business hasn't connected its own WhatsApp, send the
          // confirmation from the Anytimebot notification number.
          if (!sent) {
            await sendSystemBookingConfirmation(guestPhone, {
              guestName,
              eventTypeName: eventType.name,
              startTime: bookingStartTime.toLocaleString('es-ES', { timeZone: timezone }),
              timezone,
              cancelUrl,
              rescheduleUrl,
            });
          }
        } catch (whatsappError) {
          console.error('Failed to send WhatsApp confirmation:', whatsappError);
          // Don't fail the booking if WhatsApp fails
        }
      }
    }

    // Web Push notification for dashboard users (best-effort).
    await notifyBookingCreated(
      booking.eventType.bookingPage.userId,
      guestName,
      eventType.name,
      booking.id,
    );

    return NextResponse.json({
      success: true,
      data: booking,
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
