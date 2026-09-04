
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/event-types/[id] - Get a specific event type
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

    const eventType = await prisma.eventType.findFirst({
      where: {
        id: params.id,
        bookingPage: {
          userId: (session.user as any).id,
        },
      },
      include: {
        formFields: true,
        bookingPage: true,
        defaultLocation: { select: { id: true, name: true, address: true, timezone: true } },
        allowedResources: {
          include: {
            resource: {
              select: {
                id: true,
                name: true,
                type: true,
                capacity: true,
                isActive: true,
                location: { select: { id: true, name: true } },
              },
            },
          },
        },
        bookings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: eventType,
    });
  } catch (error) {
    console.error('Error fetching event type:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/event-types/[id] - Update an event type
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
    const {
      name,
      duration,
      bufferTime,
      location,
      videoLink,
      color,
      requiresConfirmation,
      price,
      currency,
      collectPayment,
      paymentInterval,
      formFields = [],
      teamId,
      assignmentMode,
      formSchema,
      routingRules,
      enableRouting,
      videoProvider,
      enableEmbeddedVideo,
      enableLiveAI,
      enableRecording,
      enableTranscription,
      allowedResourceIds,
      locationId,
    } = body;

    // Check if event type belongs to user
    const existingEventType = await prisma.eventType.findFirst({
      where: {
        id: params.id,
        bookingPage: {
          userId: (session.user as any).id,
        },
      },
    });

    if (!existingEventType) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    // Update event type
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (duration !== undefined) updateData.duration = parseInt(duration);
    if (bufferTime !== undefined) updateData.bufferTime = parseInt(bufferTime);
    if (location !== undefined) updateData.location = location;
    if (videoLink !== undefined) updateData.videoLink = videoLink;
    if (videoProvider !== undefined) updateData.videoProvider = videoProvider === 'DAILY' ? 'GOOGLE_MEET' : videoProvider;
    if (color !== undefined) updateData.color = color;
    if (requiresConfirmation !== undefined) updateData.requiresConfirmation = requiresConfirmation;
    if (price !== undefined) updateData.price = parseInt(price);
    if (currency !== undefined) updateData.currency = currency;
    if (collectPayment !== undefined) updateData.collectPayment = collectPayment;
    if (paymentInterval !== undefined) updateData.paymentInterval = paymentInterval;
    if (teamId !== undefined) updateData.teamId = teamId;
    if (assignmentMode !== undefined) updateData.assignmentMode = assignmentMode;
    if (formSchema !== undefined) updateData.formSchema = formSchema;
    if (routingRules !== undefined) updateData.routingRules = routingRules;
    if (enableRouting !== undefined) updateData.enableRouting = enableRouting;
    if (videoProvider !== undefined) updateData.videoProvider = videoProvider === 'DAILY' ? 'GOOGLE_MEET' : videoProvider;
    if (enableEmbeddedVideo !== undefined) updateData.enableEmbeddedVideo = enableEmbeddedVideo;
    if (enableLiveAI !== undefined) updateData.enableLiveAI = enableLiveAI;
    if (enableRecording !== undefined) updateData.enableRecording = enableRecording;
    if (enableTranscription !== undefined) updateData.enableTranscription = enableTranscription;
    // Default sede (Phase B): ''/null clears it; otherwise must be owned+active.
    if ('locationId' in body) {
      let resolvedLocationId: string | null = null;
      if (body.locationId) {
        const ownedLocation = await prisma.location.findFirst({
          where: { id: String(body.locationId), userId: (session.user as any).id, isActive: true },
          select: { id: true },
        });
        if (!ownedLocation) {
          return NextResponse.json(
            { success: false, error: 'Sede no encontrada o inactiva' },
            { status: 400 }
          );
        }
        resolvedLocationId = ownedLocation.id;
      }
      updateData.locationId = resolvedLocationId;
    }

    const eventType = await prisma.eventType.update({
      where: { id: params.id },
      data: updateData,
    });

    // Update form fields - delete existing and create new ones
    if (formFields) {
      await prisma.bookingFormField.deleteMany({
        where: { eventTypeId: params.id },
      });

      if (formFields.length > 0) {
        await prisma.bookingFormField.createMany({
          data: formFields.map((field: any) => ({
            eventTypeId: params.id,
            label: field.label,
            type: field.type,
            required: field.required || false,
            options: field.options || [],
            placeholder: field.placeholder,
          })),
        });
      }
    }

    // Replace the allowed-resources set when the payload carries it.
    if (allowedResourceIds !== undefined) {
      const resourceIds = Array.isArray(allowedResourceIds) ? allowedResourceIds.filter(Boolean) : [];
      if (resourceIds.length > 0) {
        const owned = await prisma.resource.findMany({
          where: { id: { in: resourceIds }, userId: (session.user as any).id, isActive: true },
          select: { id: true },
        });
        if (owned.length !== resourceIds.length) {
          return NextResponse.json(
            { success: false, error: 'Uno o más recursos no existen o no están activos' },
            { status: 400 }
          );
        }
      }
      await prisma.$transaction([
        prisma.eventTypeResource.deleteMany({ where: { eventTypeId: params.id } }),
        ...(resourceIds.length > 0
          ? [
              prisma.eventTypeResource.createMany({
                data: resourceIds.map((resourceId: string) => ({ eventTypeId: params.id, resourceId })),
              }),
            ]
          : []),
      ]);
    }

    // Return updated event type with form fields + allowed resources
    const updatedEventType = await prisma.eventType.findUnique({
      where: { id: params.id },
      include: {
        formFields: true,
        bookingPage: true,
        defaultLocation: { select: { id: true, name: true, address: true, timezone: true } },
        allowedResources: {
          include: {
            resource: {
              select: {
                id: true,
                name: true,
                type: true,
                capacity: true,
                isActive: true,
                location: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedEventType,
    });
  } catch (error) {
    console.error('Error updating event type:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/event-types/[id] - Delete an event type
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

    // Check if event type belongs to user
    const existingEventType = await prisma.eventType.findFirst({
      where: {
        id: params.id,
        bookingPage: {
          userId: (session.user as any).id,
        },
      },
    });

    if (!existingEventType) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    // Check if there are any bookings for this event type
    const bookingCount = await prisma.booking.count({
      where: { eventTypeId: params.id },
    });

    if (bookingCount > 0) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete event type with existing bookings' },
        { status: 400 }
      );
    }

    await prisma.eventType.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Event type deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting event type:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
