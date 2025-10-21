
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/availability - Get availability for a booking page
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingPageId = searchParams.get('bookingPageId');

    if (!bookingPageId) {
      return NextResponse.json(
        { success: false, error: 'Booking page ID is required' },
        { status: 400 }
      );
    }

    // For public access, we don't require authentication
    // But for user's own availability, we do require it for modification
    const session = await getServerSession(authOptions);

    // If user is authenticated, verify they own the booking page
    if (session?.user) {
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
    }

    const availability = await prisma.availability.findMany({
      where: { bookingPageId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error('Error fetching availability:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/availability - Create or update availability
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
    const { bookingPageId, availability } = body;

    if (!bookingPageId || !availability) {
      return NextResponse.json(
        { success: false, error: 'Booking page ID and availability are required' },
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

    // Delete existing availability for this booking page
    await prisma.availability.deleteMany({
      where: { bookingPageId },
    });

    // Create new availability entries
    const newAvailability = [];
    for (const day of availability) {
      if (day.isAvailable && day.timeSlots?.length > 0) {
        for (const slot of day.timeSlots) {
          newAvailability.push({
            bookingPageId,
            dayOfWeek: day.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isAvailable: true,
          });
        }
      }
    }

    if (newAvailability.length > 0) {
      await prisma.availability.createMany({
        data: newAvailability,
      });
    }

    // Return updated availability
    const updatedAvailability = await prisma.availability.findMany({
      where: { bookingPageId },
      orderBy: { dayOfWeek: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: updatedAvailability,
    });
  } catch (error) {
    console.error('Error updating availability:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
