
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isValidEmail, isValidPhone, addMinutes } from '@/lib/utils';
import { sendBookingConfirmationWithTemplate, sendHostBookingApprovalRequest } from '@/lib/email';
import { bookingVenueText } from '@/lib/booking-venue';
import { sendBookingConfirmation as sendWhatsAppBookingConfirmation } from '@/lib/whatsapp';
import { sendSystemBookingConfirmation } from '@/lib/system-whatsapp';
import { createCalendarEvent, checkAvailability as checkCalendarAvailability, listCalendarEvents } from '@/lib/google-calendar';
import { parseRecurrence, expandRecurrence, describeRecurrence, MAX_SERIES_HORIZON_DAYS, type RecurrenceRule } from '@/lib/series';
import { generateBookingToken } from '@/lib/booking-tokens';
import { assignTeamMember } from '@/lib/team-assignment';
import { createVideoSession } from '@/lib/video-session';
import { createProviderMeeting, recordVideoMeetingLog } from '@/lib/video-providers';
import { getPublicAppUrl } from '@/lib/public-url';
import { recordConsent } from '@/lib/consent';
import { upsertCustomerFromBooking } from '@/lib/crm';
import { findCustomersByGuestEmails, attachCustomersToBookings } from '@/lib/customer-match';
import { notifyBookingCreated } from '@/lib/push-notifications';
import { dispatchWebhookEvent, buildBookingPayload, buildMeetingPayload } from '@/lib/webhooks';
import { dispatchVolkernBookingEvent } from '@/lib/volkern';
import { pickResourceForSlot } from '@/lib/resource-assignment';
import {
  buildServiceItems,
  totalDuration,
  maxBuffer,
  anyRequiresConfirmation,
  combinedName,
} from '@/lib/multi-service';

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
          series: true,
        },
        orderBy: { startTime: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ]);

    // Attach the CRM customer (photo) when the guest email matches a contact.
    const customersByEmail = await findCustomersByGuestEmails(
      (session.user as any).id,
      bookings.map((b) => b.guestEmail)
    );
    const bookingsWithCustomers = attachCustomersToBookings(bookings, customersByEmail);

    return NextResponse.json({
      success: true,
      data: {
        bookings: bookingsWithCustomers,
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
      eventTypeIds,
      guestName,
      guestEmail,
      guestPhone,
      startTime,
      timezone = 'UTC',
      formData = {},
      routingFormResponses = {},
      recurrence,
      locationId = null,
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

    // Get the event type(s). Multi-service bookings pass an array and combine
    // the selected services into ONE consecutive block (total = sum of the
    // durations); the FIRST service is the primary eventTypeId used everywhere
    // else in this flow (team, resources, emails, calendar).
    const serviceIds =
      Array.isArray(eventTypeIds) && eventTypeIds.length > 0
        ? eventTypeIds
        : eventTypeId
          ? [eventTypeId]
          : [];
    if (serviceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    const eventTypes = await prisma.eventType.findMany({
      where: { id: { in: serviceIds } },
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
        allowedResources: {
          include: {
            resource: {
              include: {
                availabilities: true,
                location: true,
              },
            },
          },
        },
        defaultLocation: { select: { id: true, name: true, address: true, timezone: true } },
        // Branches where the event is offered (multi-sede picker).
        locations: {
          include: {
            location: { select: { id: true, name: true, address: true, timezone: true } },
          },
        },
      },
    });

    if (eventTypes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    const eventType = eventTypes[0];
    const isMultiService = eventTypes.length > 1;
    if (isMultiService) {
      const samePage = eventTypes.every((et) => et.bookingPageId === eventType.bookingPageId);
      if (!samePage) {
        return NextResponse.json(
          { success: false, error: 'Los servicios deben pertenecer a la misma página de reservas' },
          { status: 400 }
        );
      }
    }
    const serviceItems = isMultiService
      ? buildServiceItems(eventTypes)
      : null;
    const blockDuration = isMultiService
      ? totalDuration(eventTypes)
      : eventType.duration;
    const blockBuffer = isMultiService
      ? maxBuffer(eventTypes)
      : eventType.bufferTime;

    if (!eventType.bookingPage.isActive) {
      return NextResponse.json(
        { success: false, error: 'Booking page is not active' },
        { status: 400 }
      );
    }

    // ─── Branch (sucursal) resolution ───
    // When the guest picked a sede it must be one the event is offered in (or
    // the legacy default). When nothing was sent, the first offered branch (or
    // the legacy default) is used so single-branch events keep the old venue.
    const offeredLocations = eventType.locations.map((l) => l.location);
    let chosenBranch: { id: string; name: string; address: string | null } | null = null;
    if (locationId) {
      chosenBranch =
        offeredLocations.find((l) => l.id === locationId) ||
        (eventType.defaultLocation?.id === locationId ? eventType.defaultLocation : null) ||
        null;
      if (!chosenBranch) {
        return NextResponse.json(
          { success: false, error: 'Sucursal no disponible para este evento' },
          { status: 400 }
        );
      }
    } else {
      chosenBranch = offeredLocations[0] ?? eventType.defaultLocation ?? null;
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

    // ─── Recurring series (optional) ───
    // A series repeats the picked slot weekly or biweekly. Paid one-time event
    // types are excluded: a Stripe Checkout session covers exactly one
    // occurrence, so recurring + payment would silently undercharge.
    const rule: RecurrenceRule | null = parseRecurrence(recurrence);
    if (recurrence && !rule) {
      return NextResponse.json(
        { success: false, error: 'Invalid recurrence rule' },
        { status: 400 }
      );
    }
    const isPaidOneTime = eventType.collectPayment && eventType.price > 0 && eventType.paymentInterval === 'ONE_TIME';
    if (rule && isPaidOneTime) {
      return NextResponse.json(
        { success: false, error: 'Recurring bookings are not available for paid event types' },
        { status: 400 }
      );
    }

    // Resources (rooms/chairs) + recurring series: not supported yet — a
    // series would need per-occurrence resource picking. Phase C of the design.
    // Multi-service: every selected service must be resource-based, and the
    // combined block must fit on ONE resource allowed by ALL of them.
    const resourceMode = isMultiService
      ? eventTypes.every((et) => et.allowedResources.length > 0)
      : eventType.allowedResources.length > 0;
    if (rule && resourceMode) {
      return NextResponse.json(
        { success: false, error: 'Recurring bookings are not available for events with resources yet' },
        { status: 400 }
      );
    }

    // CRM: keep the guest's contact record up to date
    await upsertCustomerFromBooking(eventType.bookingPage.userId, {
      email: guestEmail,
      name: guestName,
      phone: guestPhone,
    });

    // Calculate end time (combined block when several services were selected)
    const bookingStartTime = new Date(startTime);
    const bookingEndTime = addMinutes(bookingStartTime, blockDuration);

    // Expand the recurrence rule into concrete occurrence starts. The first
    // occurrence is the user-picked slot, exactly as a single booking.
    const occurrences = rule
      ? expandRecurrence(rule, { firstStart: bookingStartTime })
      : [bookingStartTime];

    // Block recurrence for combined multi-service series for now (each
    // occurrence would need per-service resource/availability re-check).
    if (rule && isMultiService) {
      return NextResponse.json(
        { success: false, error: 'Las series recurrentes aún no están disponibles para reservas con varios servicios' },
        { status: 400 }
      );
    }

    // Guard: the whole series must stay inside the booking horizon.
    if (occurrences.length > 1) {
      const last = occurrences[occurrences.length - 1];
      if (last.getTime() - bookingStartTime.getTime() > MAX_SERIES_HORIZON_DAYS * 24 * 3600 * 1000) {
        return NextResponse.json(
          { success: false, error: 'Recurrence exceeds the maximum series horizon' },
          { status: 400 }
        );
      }
    }

    // Block bookings that fall inside the owner's time off (vacations /
    // absences) — checked for every occurrence of the series.
    for (const occ of occurrences) {
      const occEnd = addMinutes(occ, blockDuration);
      const blockingTimeOff = await prisma.timeOff.findFirst({
        where: {
          userId: eventType.bookingPage.userId,
          start: { lte: occEnd },
          end: { gte: occ },
        },
      });
      if (blockingTimeOff) {
        return NextResponse.json(
          { success: false, error: 'The host is unavailable during the selected time' },
          { status: 409 }
        );
      }
    }

    // Resource-mode events (rooms/chairs) check capacity per resource instead
    // of the owner-wide overlap check: two event types can run concurrently as
    // long as they use different physical resources. The pick below also
    // re-validates against bookings made between check-availability and now.
    let pickedResource: { resource: { id: string; name: string; location?: { id: string; name: string | null; address: string | null } | null } } | null = null;
    if (resourceMode) {
      const bookingStartTime0 = new Date(startTime);
      const occEnd = addMinutes(bookingStartTime0, blockDuration);
      // Combined block: resources allowed by EVERY selected service.
      const resourceSets = eventTypes.map((et) => et.allowedResources.map((er) => er.resource));
      let intersection = resourceSets[0] ?? [];
      for (const set of resourceSets.slice(1)) {
        const ids = new Set(set.map((r) => r.id));
        intersection = intersection.filter((r) => ids.has(r.id));
      }
      const pick = await pickResourceForSlot({
        eventTypeId,
        bookingPageId: eventType.bookingPageId,
        userId: eventType.bookingPage.userId,
        slotStart: bookingStartTime0,
        slotEnd: occEnd,
        bufferMinutes: blockBuffer,
        allowedResources: intersection,
        preferredId: (body as any).resourceId ?? null,
        // Multi-sede: only assign chairs/rooms of the chosen branch.
        locationId: locationId || (offeredLocations.length === 1 ? offeredLocations[0].id : null),
      });
      if (!pick) {
        return NextResponse.json(
          { success: false, error: 'No resource (room/chair) available for the selected time slot' },
          { status: 409 }
        );
      }
      pickedResource = pick;
    }

    // Check for conflicts for every occurrence. NOTE: deliberately NOT filtered
    // by eventTypeId — a conflict is any active booking of this owner that
    // overlaps, whatever event type it came from. Skipped in resource mode
    // (capacity per resource above is the binding constraint).
    for (const occ of occurrences) {
      const occEnd = addMinutes(occ, blockDuration);
      const conflictingBooking = resourceMode
        ? null
        : await prisma.booking.findFirst({
            where: {
              status: { in: ['CONFIRMED', 'PENDING'] },
              eventType: { bookingPage: { userId: eventType.bookingPage.userId } },
              OR: [
                {
                  startTime: { lte: occ },
                  endTime: { gt: occ },
                },
                {
                  startTime: { lt: occEnd },
                  endTime: { gte: occEnd },
                },
                {
                  startTime: { gte: occ },
                  endTime: { lte: occEnd },
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
    }

    // Assign team member if this is a team event
    let assignedMemberId: string | null = null;
    if (eventType.teamId && eventType.assignmentMode !== 'individual') {
      try {
        // For series, assign against the LAST occurrence so a member who is
        // free this week but travelling later does not capture the whole run.
        const assignmentStart = occurrences[occurrences.length - 1];
        const assignment = await assignTeamMember({
          eventTypeId,
          startTime: assignmentStart,
          endTime: addMinutes(assignmentStart, blockDuration),
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

    // Create booking(s). For a series: one BookingSeries row, the first
    // occurrence created with the full include used by the rest of the flow
    // (emails, calendar, webhooks), then the remaining occurrences in bulk.
    // All conflicts were validated before any insert, so this never partially
    // books under normal operation.
    const series = rule
      ? await prisma.bookingSeries.create({
          data: { recurrence: { ...rule } },
        })
      : null;

    const baseBookingData = {
      eventTypeId,
      guestName,
      guestEmail,
      guestPhone,
      timezone,
      status: ((isMultiService ? anyRequiresConfirmation(eventTypes) : eventType.requiresConfirmation)
        ? 'PENDING'
        : 'CONFIRMED') as 'PENDING' | 'CONFIRMED',
      formData,
      assignedMemberId,
      ...(serviceItems ? { serviceItems: serviceItems as any } : {}),
      // Resource/location snapshot. Resource-mode events store the assigned
      // room/chair (+ its sede); in-person events without resources store the
      // default sede of the event type (its address is the "where").
      ...(pickedResource
        ? {
            resourceId: pickedResource.resource.id,
            resourceName: pickedResource.resource.name,
            locationId: pickedResource.resource.location?.id ?? chosenBranch?.id ?? null,
            locationName: pickedResource.resource.location?.name ?? chosenBranch?.name ?? null,
            locationAddress: pickedResource.resource.location?.address ?? chosenBranch?.address ?? null,
          }
        : chosenBranch
          ? {
              locationId: chosenBranch.id,
              locationName: chosenBranch.name,
              locationAddress: chosenBranch.address,
            }
          : {}),
    };

    const booking = await prisma.booking.create({
      data: series
        ? { ...baseBookingData, seriesId: series.id, startTime: bookingStartTime, endTime: bookingEndTime }
        : { ...baseBookingData, startTime: bookingStartTime, endTime: bookingEndTime },
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

    if (series && occurrences.length > 1) {
      await prisma.booking.createMany({
        data: occurrences.slice(1).map((occ) => ({
          ...baseBookingData,
          seriesId: series.id,
          startTime: occ,
          endTime: addMinutes(occ, blockDuration),
        })),
      });
    }

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

    // Auto-create the Zoom/Teams meeting on the owner's connected account
    // when the event type uses one of those providers. The generated join
    // link replaces the manual videoLink for this booking (emails, calendar,
    // reminders and the meeting room); if the provider is not connected, the
    // manually pasted link is kept.
    let providerMeeting: {
      roomUrl: string;
      hostRoomUrl?: string;
      roomName?: string;
      password?: string;
    } | null = null;
    if (eventType.videoProvider === 'ZOOM' || eventType.videoProvider === 'TEAMS') {
      const providerName: 'zoom' | 'teams' = eventType.videoProvider === 'ZOOM' ? 'zoom' : 'teams';
      const meetingOwnerId = eventType.bookingPage.userId;
      try {
        const created = await createProviderMeeting({
          userId: meetingOwnerId,
          provider: providerName,
          topic: eventType.name,
          startTime: bookingStartTime,
          duration: eventType.duration,
          timezone: booking.timezone || 'UTC',
          agenda: `Reunión con ${guestName}`,
          attendeeEmails: [guestEmail],
        });
        if (created.roomUrl) {
          providerMeeting = {
            roomUrl: created.roomUrl,
            hostRoomUrl: created.hostRoomUrl,
            roomName: created.roomName,
            password: created.password,
          };
          // In-memory so the confirmation email of THIS booking includes it,
          // and persisted on the booking so reminders/reschedule can use it.
          eventType.videoLink = created.roomUrl;
          await prisma.booking
            .update({
              where: { id: booking.id },
              data: { meetingUrl: created.roomUrl },
            })
            .catch(() => undefined);
          // Audit trail + outgoing webhook: meeting created.
          await recordVideoMeetingLog({
            userId: meetingOwnerId,
            bookingId: booking.id,
            provider: providerName,
            success: true,
            roomUrl: created.roomUrl,
            meetingId: created.roomName,
          });
          await dispatchWebhookEvent(
            meetingOwnerId,
            'meeting.created',
            buildMeetingPayload('meeting.created', {
              bookingId: booking.id,
              provider: providerName,
              success: true,
              roomUrl: created.roomUrl,
              meetingId: created.roomName,
            }),
          );
        } else {
          const reason = created.error || 'desconocido';
          console.warn(
            `No se pudo crear la reunión de ${eventType.videoProvider}: ${reason}`
          );
          // Audit trail + outgoing webhook: meeting failed (provider error).
          await recordVideoMeetingLog({
            userId: meetingOwnerId,
            bookingId: booking.id,
            provider: providerName,
            success: false,
            error: reason,
          });
          await dispatchWebhookEvent(
            meetingOwnerId,
            'meeting.failed',
            buildMeetingPayload('meeting.failed', {
              bookingId: booking.id,
              provider: providerName,
              success: false,
              error: reason,
            }),
          );
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'desconocido';
        console.error(`Error creating ${eventType.videoProvider} meeting:`, error);
        // Audit trail + outgoing webhook: meeting failed (exception).
        await recordVideoMeetingLog({
          userId: meetingOwnerId,
          bookingId: booking.id,
          provider: providerName,
          success: false,
          error: reason,
        });
        await dispatchWebhookEvent(
          meetingOwnerId,
          'meeting.failed',
          buildMeetingPayload('meeting.failed', {
            bookingId: booking.id,
            provider: providerName,
            success: false,
            error: reason,
          }),
        );
      }
    }

    // Create Google Calendar event(s) if user has calendar sync enabled.
    // For a series: one free/busy sweep across the whole span, then one event
    // per occurrence (best-effort — the bookings already exist in the DB).
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
        const seriesLastEnd = series
          ? addMinutes(occurrences[occurrences.length - 1], blockDuration)
          : bookingEndTime;

        // Check calendar availability first (single call covering the span)
        const isAvailable = series
          ? (await listCalendarEvents(bookingOwner.id, bookingStartTime, seriesLastEnd)).length === 0
          : await checkCalendarAvailability(
              bookingOwner.id,
              bookingStartTime,
              bookingEndTime
            );

        if (isAvailable) {
          const occurrenceBookings = series
            ? await prisma.booking.findMany({
                where: { seriesId: series.id },
                orderBy: { startTime: 'asc' },
                select: { id: true },
              })
            : [{ id: booking.id }];

          for (let i = 0; i < occurrences.length; i++) {
            const occ = occurrences[i];
            const occEnd = addMinutes(occ, blockDuration);
            const occBookingId = occurrenceBookings[i]?.id ?? booking.id;

            const calendarEvent = await createCalendarEvent(bookingOwner.id, {
              summary: `${isMultiService ? combinedName(eventTypes) : eventType.name} - ${guestName}`,
              description: `Booking with ${guestName}\nEmail: ${guestEmail}${guestPhone ? `\nPhone: ${guestPhone}` : ''}`,
              location: eventType.location === 'video' && eventType.videoLink ? eventType.videoLink : eventType.location,
              conferenceData: eventType.videoProvider === 'GOOGLE_MEET' ? {
                createRequest: {
                  requestId: `anytimebot-${occBookingId}`,
                  conferenceSolutionKey: { type: 'hangoutsMeet' },
                },
              } : undefined,
              start: occ,
              end: occEnd,
              attendees: [guestEmail],
            });

            if (i === 0) {
              const generatedMeetUrl = eventType.videoProvider === 'GOOGLE_MEET'
                ? calendarEvent?.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri
                : undefined;

              if (generatedMeetUrl) {
                eventType.videoLink = generatedMeetUrl;
              }
            }

            if (calendarEvent?.id) {
              if (i === 0) googleCalendarEventId = calendarEvent.id;
              await prisma.booking.update({
                where: { id: occBookingId },
                data: { googleCalendarEventId: calendarEvent.id },
              }).catch(() => undefined);
            }
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

    // Create video session for embedded video (Daily) or auto-generated
    // Zoom/Teams meetings so the meeting room can load the join link.
    let videoSession = null;
    const autoVideoSession =
      (eventType.videoProvider === 'ZOOM' || eventType.videoProvider === 'TEAMS') &&
      !!providerMeeting;
    if (
      (eventType.videoProvider === 'DAILY' && eventType.enableEmbeddedVideo) ||
      autoVideoSession
    ) {
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
          meetingUrls: providerMeeting
            ? {
                roomUrl: providerMeeting.roomUrl,
                hostRoomUrl: providerMeeting.hostRoomUrl || providerMeeting.roomUrl,
                roomName: providerMeeting.roomName || null,
                password: providerMeeting.password,
              }
            : undefined,
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
          eventTitle: isMultiService ? combinedName(eventTypes) : eventType.name,
          startTime: bookingStartTime,
          duration: blockDuration,
          location: eventType.location,
          venue: bookingVenueText(booking),
          videoLink: eventType.videoLink || undefined,
          timezone,
          bookingId: booking.id,
          cancelToken,
          rescheduleToken,
          meetingPageUrl,
          ...(serviceItems
            ? { serviceItems: serviceItems.map((s) => ({ name: s.name, duration: s.duration })) }
            : {}),
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

    // When the booking requires host confirmation it stays PENDING: notify the
    // host by email (and Web Push below) so they can approve it from the dashboard.
    if (booking.status === 'PENDING' && eventType.requiresConfirmation) {
      const host = booking.eventType?.bookingPage?.user;
      try {
        if (host?.email) {
          const appBaseUrl = getPublicAppUrl();
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
            dashboardUrl: `${appBaseUrl}/dashboard/bookings?status=pending`,
          });
        }
      } catch (hostEmailError) {
        console.error('Failed to send host booking-request email:', hostEmailError);
      }
    }

    // Web Push notification for dashboard users (best-effort).
    await notifyBookingCreated(
      booking.eventType.bookingPage.userId,
      guestName,
      eventType.name,
      booking.id,
    );

    // Outgoing webhook for external integrations (best-effort, persisted first).
    // For series, include the recurrence rule so external platforms can render
    // the pattern without extra round-trips.
    const bookingPayload = series
      ? { ...buildBookingPayload('booking.created', booking), recurrence: { ...rule!, count: occurrences.length } }
      : buildBookingPayload('booking.created', booking);
    await dispatchWebhookEvent(
      booking.eventType.bookingPage.userId,
      'booking.created',
      bookingPayload,
    );

    // Sync to Volkern CRM (best-effort): create/update lead + appointment.
    await dispatchVolkernBookingEvent(booking.eventType.bookingPage.userId, 'BOOKING_CREATED', {
      id: booking.id,
      guestName: booking.guestName,
      guestEmail: booking.guestEmail,
      guestPhone: booking.guestPhone,
      startTime: booking.startTime,
      endTime: booking.endTime,
      timezone: booking.timezone,
      eventTypeName: eventType.name,
      formData: booking.formData || undefined,
      meetingUrl: booking.meetingUrl,
    });

    const seriesInfo = series && rule
      ? {
          id: series.id,
          ...rule,
          occurrences: occurrences.length,
          summary: describeRecurrence(rule, 'es'),
          lastStart: occurrences[occurrences.length - 1].toISOString(),
        }
      : null;

    return NextResponse.json({
      success: true,
      data: booking,
      series: seriesInfo,
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
