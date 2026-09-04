import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { rateLimitHeaders } from '@/lib/rate-limit';
import { isValidEmail, addMinutes } from '@/lib/utils';
import { sendBookingConfirmationWithTemplate, sendHostBookingApprovalRequest } from '@/lib/email';
import { sendBookingConfirmation as sendWhatsAppBookingConfirmation } from '@/lib/whatsapp';
import { sendSystemBookingConfirmation } from '@/lib/system-whatsapp';
import { createCalendarEvent, checkAvailability as checkCalendarAvailability } from '@/lib/google-calendar';
import { generateBookingToken } from '@/lib/booking-tokens';
import { assignTeamMember } from '@/lib/team-assignment';
import { getPublicAppUrl } from '@/lib/public-url';
import { recordConsent } from '@/lib/consent';
import { upsertCustomerFromBooking } from '@/lib/crm';
import { notifyBookingCreated } from '@/lib/push-notifications';
import { dispatchWebhookEvent, buildBookingPayload } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

// GET /api/v1/bookings - list bookings for external sync.
// Filters: event_type_id, status, from, to, updated_since, page, limit
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);

  const eventTypeId = searchParams.get('event_type_id');
  const status = searchParams.get('status');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const updatedSince = searchParams.get('updated_since');
  const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100);

  const where: any = { eventType: { bookingPage: { userId: auth.userId } } };
  if (eventTypeId) where.eventTypeId = eventTypeId;
  if (status) {
    const statuses = status.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (statuses.length) where.status = { in: statuses };
  }
  if (from || to) {
    where.startTime = {};
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: 'bad_request', message: 'Invalid `from` date' },
          { status: 400 }
        );
      }
      where.startTime.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: 'bad_request', message: 'Invalid `to` date' },
          { status: 400 }
        );
      }
      where.startTime.lte = d;
    }
  }
  if (updatedSince) {
    const d = new Date(updatedSince);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { success: false, error: 'bad_request', message: 'Invalid `updated_since` date' },
        { status: 400 }
      );
    }
    where.updatedAt = { gte: d };
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { startTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        eventTypeId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        startTime: true,
        endTime: true,
        timezone: true,
        status: true,
        formData: true,
        notes: true,
        paymentStatus: true,
        paymentAmount: true,
        paymentCurrency: true,
        createdAt: true,
        updatedAt: true,
        eventType: { select: { id: true, name: true, duration: true, location: true, videoLink: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  return NextResponse.json(
    {
      success: true,
      data: bookings.map((b) => ({
        id: b.id,
        event_type: {
          id: b.eventType.id,
          name: b.eventType.name,
          location: b.eventType.location,
          video_link: b.eventType.videoLink,
        },
        guest: {
          name: b.guestName,
          email: b.guestEmail,
          phone: b.guestPhone,
        },
        start_time: b.startTime.toISOString(),
        end_time: b.endTime.toISOString(),
        timezone: b.timezone,
        status: b.status,
        form_data: b.formData,
        notes: b.notes,
        payment: b.paymentStatus
          ? { status: b.paymentStatus, amount_cents: b.paymentAmount, currency: b.paymentCurrency }
          : null,
        created_at: b.createdAt.toISOString(),
        updated_at: b.updatedAt.toISOString(),
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
    { headers: rateLimitHeaders(auth.rateLimit) }
  );
}

// POST /api/v1/bookings - create a booking on behalf of the API key's owner.
// External platforms call this with the same payload as the public booking page:
// { event_type_id, guest: { name, email, phone? }, start_time, timezone?, form_data? }
export async function POST(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (auth instanceof NextResponse) return auth;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { success: false, error: 'bad_request', message: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const eventTypeId = typeof body.event_type_id === 'string' ? body.event_type_id : null;
  const guest = (body.guest && typeof body.guest === 'object' ? body.guest : {}) as {
    name?: unknown;
    email?: unknown;
    phone?: unknown;
  };
  const guestName = typeof guest.name === 'string' ? guest.name.trim() : '';
  const guestEmail = typeof guest.email === 'string' ? guest.email.trim() : '';
  const guestPhone = typeof guest.phone === 'string' ? guest.phone.trim() : null;
  const startTimeRaw = typeof body.start_time === 'string' ? body.start_time : null;
  const timezone = typeof body.timezone === 'string' && body.timezone ? body.timezone : 'UTC';
  const formData = body.form_data && typeof body.form_data === 'object' ? body.form_data : {};

  // --- Validation -----------------------------------------------------------
  if (!eventTypeId || !guestName || !guestEmail || !startTimeRaw) {
    return NextResponse.json(
      {
        success: false,
        error: 'bad_request',
        message: 'event_type_id, guest.name, guest.email and start_time are required',
      },
      { status: 400 }
    );
  }
  if (!isValidEmail(guestEmail)) {
    return NextResponse.json(
      { success: false, error: 'bad_request', message: 'guest.email is not a valid email address' },
      { status: 400 }
    );
  }

  const startTime = new Date(startTimeRaw);
  if (Number.isNaN(startTime.getTime())) {
    return NextResponse.json(
      { success: false, error: 'bad_request', message: 'start_time is not a valid ISO 8601 date' },
      { status: 400 }
    );
  }

  // The event type must belong to the API key's owner — external platforms can
  // only book into accounts whose key they hold.
  const eventType = await prisma.eventType.findFirst({
    where: { id: eventTypeId, bookingPage: { userId: auth.userId } },
    include: {
      bookingPage: true,
      formFields: true,
      team: { include: { members: { include: { user: true } } } },
    },
  });

  if (!eventType) {
    return NextResponse.json(
      { success: false, error: 'not_found', message: 'Event type not found for this account' },
      { status: 404 }
    );
  }
  if (!eventType.bookingPage.isActive) {
    return NextResponse.json(
      { success: false, error: 'bad_request', message: 'Booking page is not active' },
      { status: 400 }
    );
  }

  // Required custom form fields (same rule as the public page).
  const missingRequired = (eventType.formFields || []).filter((f: any) => {
    const v = (formData as any)[f.id];
    return f.required && (v === undefined || v === null || v === '' || v === false);
  });
  if (missingRequired.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'bad_request',
        message: `Missing required form fields: ${missingRequired.map((f: any) => f.label).join(', ')}`,
      },
      { status: 400 }
    );
  }

  // GDPR Art. 7 consent before any guest-data processing.
  try {
    await recordConsent(
      {
        purpose: 'booking',
        subjectEmail: guestEmail,
        tenantId: null,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
        userAgent: request.headers.get('user-agent'),
      },
      true
    );
  } catch (consentError) {
    console.error('Failed to record booking consent:', consentError);
  }

  const bookingStartTime = startTime;
  const bookingEndTime = addMinutes(bookingStartTime, eventType.duration);

  // Host absences block the slot.
  const blockingTimeOff = await prisma.timeOff.findFirst({
    where: {
      userId: eventType.bookingPage.userId,
      start: { lte: bookingEndTime },
      end: { gte: bookingStartTime },
    },
  });
  if (blockingTimeOff) {
    return NextResponse.json(
      { success: false, error: 'conflict', message: 'The host is unavailable during the selected time' },
      { status: 409 }
    );
  }

  // Slot conflicts within the event type.
  const conflictingBooking = await prisma.booking.findFirst({
    where: {
      eventTypeId,
      status: { in: ['CONFIRMED', 'PENDING'] },
      OR: [
        { startTime: { lte: bookingStartTime }, endTime: { gt: bookingStartTime } },
        { startTime: { lt: bookingEndTime }, endTime: { gte: bookingEndTime } },
        { startTime: { gte: bookingStartTime }, endTime: { lte: bookingEndTime } },
      ],
    },
  });
  if (conflictingBooking) {
    return NextResponse.json(
      { success: false, error: 'conflict', message: 'Time slot is already booked' },
      { status: 409 }
    );
  }

  // Team assignment (round robin / smart routing) when applicable.
  let assignedMemberId: string | null = null;
  if (eventType.teamId && eventType.assignmentMode !== 'individual') {
    try {
      const assignment = await assignTeamMember({
        eventTypeId,
        startTime: bookingStartTime,
        endTime: bookingEndTime,
        formData: formData as Record<string, string>,
        routingFormResponses: undefined,
      });
      if (assignment) {
        assignedMemberId = Array.isArray(assignment) ? assignment[0] : assignment;
      }
      if (!assignedMemberId) {
        return NextResponse.json(
          { success: false, error: 'conflict', message: 'No team member available for the selected time slot' },
          { status: 409 }
        );
      }
    } catch (error) {
      console.error('Error assigning team member:', error);
    }
  }

  // CRM: keep the guest's contact record up to date.
  try {
    await upsertCustomerFromBooking(eventType.bookingPage.userId, {
      email: guestEmail,
      name: guestName,
      phone: guestPhone,
    });
  } catch (crmError) {
    console.error('Failed to upsert customer:', crmError);
  }

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
      formData: formData as any,
      assignedMemberId,
    },
  });

  // Google Calendar event when the owner has sync enabled (best-effort).
  try {
    const bookingOwner = await prisma.user.findUnique({
      where: { id: eventType.bookingPage.userId },
      select: {
        id: true,
        calendarSyncEnabled: true,
        accounts: { where: { provider: 'google' }, select: { access_token: true } },
      },
    });

    if (bookingOwner?.calendarSyncEnabled && bookingOwner.accounts[0]?.access_token) {
      const isAvailable = await checkCalendarAvailability(
        bookingOwner.id,
        bookingStartTime,
        bookingEndTime
      );
      if (isAvailable) {
        const calendarEvent = await createCalendarEvent(bookingOwner.id, {
          summary: `${eventType.name} - ${guestName}`,
          description: `Booking with ${guestName}\nEmail: ${guestEmail}${guestPhone ? `\nPhone: ${guestPhone}` : ''}`,
          location:
            eventType.location === 'video' && eventType.videoLink
              ? eventType.videoLink
              : eventType.location,
          conferenceData:
            eventType.videoProvider === 'GOOGLE_MEET'
              ? {
                  createRequest: {
                    requestId: `anytimebot-${booking.id}`,
                    conferenceSolutionKey: { type: 'hangoutsMeet' },
                  },
                }
              : undefined,
          start: bookingStartTime,
          end: bookingEndTime,
          attendees: [guestEmail],
        });
        if (calendarEvent?.id) {
          await prisma.booking.update({
            where: { id: booking.id },
            data: { googleCalendarEventId: calendarEvent.id },
          });
        }
      }
    }
  } catch (calendarError) {
    console.error('Failed to create Google Calendar event:', calendarError);
  }

  const cancelToken = generateBookingToken(booking.id, 'cancel');
  const rescheduleToken = generateBookingToken(booking.id, 'reschedule');

  // Guest notifications only when the booking is immediately confirmed.
  if (booking.status === 'CONFIRMED') {
    try {
      const baseUrl = getPublicAppUrl();
      await sendBookingConfirmationWithTemplate({
        userId: eventType.bookingPage.userId,
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
        meetingPageUrl: undefined,
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
    }

    if (guestPhone) {
      const appBaseUrl = getPublicAppUrl();
      const cancelUrl = `${appBaseUrl}/booking/cancel?token=${cancelToken}`;
      const rescheduleUrl = `${appBaseUrl}/booking/reschedule?token=${rescheduleToken}`;
      try {
        const sent = await sendWhatsAppBookingConfirmation(
          eventType.bookingPage.userId,
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
      }
    }
  } else if (eventType.requiresConfirmation) {
    // PENDING booking: ask the host to approve it from the dashboard.
    try {
      const host = await prisma.user.findUnique({
        where: { id: eventType.bookingPage.userId },
        select: { id: true, email: true, name: true },
      });
      if (host?.email) {
        await sendHostBookingApprovalRequest({
          userId: host.id,
          to: host.email,
          hostName: host.name,
          guestName,
          guestEmail,
          guestPhone: guestPhone || undefined,
          eventTitle: eventType.name,
          startTime: bookingStartTime,
          timezone,
          dashboardUrl: `${getPublicAppUrl()}/dashboard/bookings?status=pending`,
        });
      }
    } catch (hostEmailError) {
      console.error('Failed to send host booking-request email:', hostEmailError);
    }
  }

  // Web Push for the dashboard owner (best-effort).
  try {
    await notifyBookingCreated(eventType.bookingPage.userId, guestName, eventType.name, booking.id);
  } catch (pushError) {
    console.error('Failed to send web push:', pushError);
  }

  // Outgoing webhook for external integrations (best-effort, persisted first).
  await dispatchWebhookEvent(
    eventType.bookingPage.userId,
    'booking.created',
    buildBookingPayload('booking.created', { ...booking, eventType }),
  );

  return NextResponse.json(
    {
      success: true,
      data: {
        id: booking.id,
        event_type_id: booking.eventTypeId,
        guest: { name: booking.guestName, email: booking.guestEmail, phone: booking.guestPhone },
        start_time: booking.startTime.toISOString(),
        end_time: booking.endTime.toISOString(),
        timezone: booking.timezone,
        status: booking.status,
        form_data: booking.formData,
        created_at: booking.createdAt.toISOString(),
      },
    },
    { status: 201, headers: rateLimitHeaders(auth.rateLimit) }
  );
}
