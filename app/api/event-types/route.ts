
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
      videoProvider = 'GOOGLE_MEET',
      color = '#6366f1',
      requiresConfirmation = false,
      price = 0,
      currency = 'usd',
      collectPayment = false,
      paymentInterval = 'ONE_TIME',
      teamId = null,
      assignmentMode = 'individual',
      formFields = [],
      formSchema = null,
      routingRules = null,
      enableRouting = false,
      allowedResourceIds = [],
      locationId = null,
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

    // Validate allowed resources belong to the user and are active.
    const resourceIds = Array.isArray(allowedResourceIds) ? allowedResourceIds.filter(Boolean) : [];
    let allowedResources: { resourceId: string }[] = [];
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
      allowedResources = owned.map((r) => ({ resourceId: r.id }));
    }

    // Default sede (Phase B): must belong to the user and be active.
    let defaultLocationId: string | null = null;
    if (locationId) {
      const ownedLocation = await prisma.location.findFirst({
        where: { id: String(locationId), userId: (session.user as any).id, isActive: true },
        select: { id: true },
      });
      if (!ownedLocation) {
        return NextResponse.json(
          { success: false, error: 'Sede no encontrada o inactiva' },
          { status: 400 }
        );
      }
      defaultLocationId = ownedLocation.id;
    }

    // Create event type (with its allowed resources when any are given)
    const eventType = await prisma.eventType.create({
      data: {
        bookingPageId,
        name,
        duration: parseInt(duration),
        bufferTime: parseInt(bufferTime),
        location,
        videoLink,
        videoProvider: videoProvider === 'DAILY' ? 'GOOGLE_MEET' : videoProvider,
        color,
        requiresConfirmation,
        price: parseInt(price),
        currency,
        collectPayment,
        paymentInterval,
        teamId,
        assignmentMode,
        formSchema,
        routingRules,
        enableRouting,
        locationId: defaultLocationId,
        ...(allowedResources.length > 0
          ? {
              allowedResources: {
                create: allowedResources,
              },
            }
          : {}),
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
