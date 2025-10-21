
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/event-types - Get all event types for user's booking pages
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
    const bookingPageId = searchParams.get('bookingPageId');

    let where: any = {
      bookingPage: {
        userId: (session.user as any).id,
      },
    };

    if (bookingPageId) {
      where.bookingPageId = bookingPageId;
    }

    const eventTypes = await prisma.eventType.findMany({
      where,
      include: {
        formFields: true,
        bookingPage: true,
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            bookings: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: eventTypes,
    });
  } catch (error) {
    console.error('Error fetching event types:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/event-types - Create a new event type
export async function POST(request: NextRequest) {
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
      bookingPageId,
      name,
      duration,
      bufferTime = 0,
      location = 'video',
      videoLink,
      color = '#6366f1',
      requiresConfirmation = false,
      teamId = null,
      assignmentMode = 'individual',
      formFields = [],
      formSchema = null,
      routingRules = null,
      enableRouting = false,
    } = body;

    // Validation
    if (!bookingPageId || !name || !duration) {
      return NextResponse.json(
        { success: false, error: 'Booking page ID, name, and duration are required' },
        { status: 400 }
      );
    }

    // Check if booking page belongs to user
    const bookingPage = await prisma.bookingPage.findFirst({
      where: {
        id: bookingPageId,
        userId: (session.user as any).id,
      },
    });

    if (!bookingPage) {
      return NextResponse.json(
        { success: false, error: 'Booking page not found' },
        { status: 404 }
      );
    }

    // Create event type
    const eventType = await prisma.eventType.create({
      data: {
        bookingPageId,
        name,
        duration: parseInt(duration),
        bufferTime: parseInt(bufferTime),
        location,
        videoLink,
        color,
        requiresConfirmation,
        teamId,
        assignmentMode,
        formSchema,
        routingRules,
        enableRouting,
      },
    });

    // Create form fields if provided
    if (formFields?.length > 0) {
      await prisma.bookingFormField.createMany({
        data: formFields.map((field: any) => ({
          eventTypeId: eventType.id,
          label: field.label,
          type: field.type,
          required: field.required || false,
          options: field.options || [],
          placeholder: field.placeholder,
        })),
      });
    }

    // Return event type with form fields
    const eventTypeWithFields = await prisma.eventType.findUnique({
      where: { id: eventType.id },
      include: {
        formFields: true,
        bookingPage: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: eventTypeWithFields,
    });
  } catch (error) {
    console.error('Error creating event type:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
