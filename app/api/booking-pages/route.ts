
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isValidUsername } from '@/lib/utils';

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
    const { slug, title, description, isActive = true, brandColor, logoUrl } = body;
    const normalizedSlug = String(slug || '').trim().toLowerCase();

    // Validation
    if (!normalizedSlug || !title) {
      return NextResponse.json(
        { success: false, error: 'Slug and title are required' },
        { status: 400 }
      );
    }

    if (!isValidUsername(normalizedSlug)) {
      return NextResponse.json(
        { success: false, error: 'Invalid slug format' },
        { status: 400 }
      );
    }

    // Check if slug is already taken
    const existingUser = await prisma.user.findUnique({ where: { id: (session.user as any).id }, select: { username: true } });
    if (!existingUser?.username) {
      return NextResponse.json({ success: false, error: 'Configure your public username before creating a booking page' }, { status: 400 });
    }

    const existingPage = await prisma.bookingPage.findFirst({
      where: { userId: (session.user as any).id, slug: normalizedSlug },
    });

    if (existingPage) {
      return NextResponse.json(
        { success: false, error: 'This slug is already taken' },
        { status: 409 }
      );
    }

    // Enforce the plan's booking-page quota (multi-calendar limit)
    const [pageCount, quota] = await Promise.all([
      prisma.bookingPage.count({ where: { userId: (session.user as any).id } }),
      prisma.quotas.findUnique({
        where: { userId: (session.user as any).id },
        select: { bookingPages: true },
      }),
    ]);
    const maxPages = quota?.bookingPages ?? 1;
    if (pageCount >= maxPages) {
      return NextResponse.json(
        {
          success: false,
          error: `Booking page limit reached (${pageCount}/${maxPages}). Upgrade your plan to create more calendars.`,
        },
        { status: 403 }
      );
    }

    const bookingPage = await prisma.bookingPage.create({
      data: {
        userId: (session.user as any).id,
        slug: normalizedSlug,
        title,
        description,
        isActive,
        brandColor: typeof brandColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(brandColor) ? brandColor : '#6366f1',
        logoUrl: typeof logoUrl === 'string' && logoUrl.trim() ? logoUrl.trim() : null,
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
