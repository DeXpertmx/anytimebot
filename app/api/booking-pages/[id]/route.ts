
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isValidUsername } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// GET /api/booking-pages/[id] - Get a specific booking page
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

    const bookingPage = await prisma.bookingPage.findFirst({
      where: {
        id: params.id,
        userId: (session.user as any).id,
      },
      include: {
        eventTypes: {
          include: {
            formFields: true,
          },
        },
        availability: true,
      },
    });

    if (!bookingPage) {
      return NextResponse.json(
        { success: false, error: 'Booking page not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: bookingPage,
    });
  } catch (error) {
    console.error('Error fetching booking page:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/booking-pages/[id] - Update a booking page
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
    const { slug, title, description, isActive, slotInterval, availability } = body;

    // Validation
    if (!slug || !title) {
      return NextResponse.json(
        { success: false, error: 'Slug and title are required' },
        { status: 400 }
      );
    }

    if (!isValidUsername(slug)) {
      return NextResponse.json(
        { success: false, error: 'Invalid slug format' },
        { status: 400 }
      );
    }

    // Check if the booking page exists and belongs to the user
    const existingPage = await prisma.bookingPage.findFirst({
      where: {
        id: params.id,
        userId: (session.user as any).id,
      },
    });

    if (!existingPage) {
      return NextResponse.json(
        { success: false, error: 'Booking page not found' },
        { status: 404 }
      );
    }

    // Check if slug is already taken by another page
    if (slug !== existingPage.slug) {
      const slugTaken = await prisma.bookingPage.findFirst({
        where: {
          slug,
          id: { not: params.id },
        },
      });

      if (slugTaken) {
        return NextResponse.json(
          { success: false, error: 'This slug is already taken' },
          { status: 409 }
        );
      }
    }

    // Update booking page and availability in a transaction
    const updatedPage = await prisma.$transaction(async (tx) => {
      // Update booking page
      const page = await tx.bookingPage.update({
        where: { id: params.id },
        data: {
          slug,
          title,
          description,
          isActive,
          slotInterval: slotInterval || 15,
        },
      });

      // Update availability if provided
      if (availability && Array.isArray(availability)) {
        // Delete existing availability slots
        await tx.availability.deleteMany({
          where: { bookingPageId: params.id },
        });

        // Create new availability slots
        if (availability.length > 0) {
          await tx.availability.createMany({
            data: availability.map((slot: any) => ({
              bookingPageId: params.id,
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              isAvailable: slot.isAvailable !== undefined ? slot.isAvailable : true,
            })),
          });
        }
      }

      // Return updated page with all relations
      return await tx.bookingPage.findUnique({
        where: { id: params.id },
        include: {
          eventTypes: true,
          availability: true,
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: updatedPage,
    });
  } catch (error) {
    console.error('Error updating booking page:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/booking-pages/[id] - Delete a booking page
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

    // Check if the booking page exists and belongs to the user
    const existingPage = await prisma.bookingPage.findFirst({
      where: {
        id: params.id,
        userId: (session.user as any).id,
      },
    });

    if (!existingPage) {
      return NextResponse.json(
        { success: false, error: 'Booking page not found' },
        { status: 404 }
      );
    }

    await prisma.bookingPage.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Booking page deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting booking page:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
