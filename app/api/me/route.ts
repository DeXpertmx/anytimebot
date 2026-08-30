import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/me — minimal profile info for the authenticated user:
// username (used in public URLs), booking page count and quota.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        name: true,
        email: true,
        image: true,
        _count: { select: { bookingPages: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const quotas = await prisma.quotas.findUnique({
      where: { userId },
      select: { bookingPages: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        username: user.username,
        name: user.name,
        email: user.email,
        image: user.image,
        bookingPages: user._count.bookingPages,
        maxBookingPages: quotas?.bookingPages ?? 1,
      },
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
