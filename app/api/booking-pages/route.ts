
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateSlug, isValidUsername } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// GET /api/booking-pages - Get all booking pages for the authenticated user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const bookingPages = await prisma.bookingPage.findMany({
      where: { userId: (session.user as any).id },
      include: {
        eventTypes: true,
        _count: {
          select: {
            eventTypes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: bookingPages,
    });
  } catch (error) {
    console.error('Error fetching booking pages:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/booking-pages - Create a new booking page
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
    const { slug, title, description, isActive = true } = body;

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

    // Check if slug is already taken
    const existingPage = await prisma.bookingPage.findUnique({
      where: { slug },
    });

    if (existingPage) {
      return NextResponse.json(
        { success: false, error: 'This slug is already taken' },
        { status: 409 }
      );
    }

    const bookingPage = await prisma.bookingPage.create({
      data: {
        userId: (session.user as any).id,
        slug,
        title,
        description,
        isActive,
      },
      include: {
        eventTypes: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: bookingPage,
    });
  } catch (error) {
    console.error('Error creating booking page:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
