
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
    if (color !== undefined) updateData.color = color;
    if (requiresConfirmation !== undefined) updateData.requiresConfirmation = requiresConfirmation;
    if (teamId !== undefined) updateData.teamId = teamId;
    if (assignmentMode !== undefined) updateData.assignmentMode = assignmentMode;
    if (formSchema !== undefined) updateData.formSchema = formSchema;
    if (routingRules !== undefined) updateData.routingRules = routingRules;
    if (enableRouting !== undefined) updateData.enableRouting = enableRouting;
    if (videoProvider !== undefined) updateData.videoProvider = videoProvider;
    if (enableEmbeddedVideo !== undefined) updateData.enableEmbeddedVideo = enableEmbeddedVideo;
    if (enableLiveAI !== undefined) updateData.enableLiveAI = enableLiveAI;
    if (enableRecording !== undefined) updateData.enableRecording = enableRecording;
    if (enableTranscription !== undefined) updateData.enableTranscription = enableTranscription;

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

    // Return updated event type with form fields
    const updatedEventType = await prisma.eventType.findUnique({
      where: { id: params.id },
      include: {
        formFields: true,
        bookingPage: true,
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
