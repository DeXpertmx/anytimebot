import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseDayStart(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDayEnd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T23:59:59.999Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// GET /api/time-off - list the owner's vacation / absence blocks
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const timeOffs = await prisma.timeOff.findMany({
      where: { userId: (session.user as any).id },
      orderBy: { start: 'desc' },
      include: {
        resource: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: timeOffs });
  } catch (error) {
    console.error('Error fetching time off:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/time-off - create a whole-day absence range
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, start, end, resourceId } = body;

    const startDate = parseDayStart(start);
    const endDate = parseDayEnd(end);

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'Start and end dates (YYYY-MM-DD) are required' },
        { status: 400 }
      );
    }

    if (endDate.getTime() < startDate.getTime()) {
      return NextResponse.json(
        { success: false, error: 'End date must be on or after start date' },
        { status: 400 }
      );
    }

    // Optional per-resource scope (Phase B): only that room/chair is blocked.
    let ownedResourceId: string | null = null;
    if (resourceId) {
      const resource = await prisma.resource.findFirst({
        where: { id: String(resourceId), userId: (session.user as any).id, isActive: true },
        select: { id: true },
      });
      if (!resource) {
        return NextResponse.json(
          { success: false, error: 'Resource not found' },
          { status: 404 }
        );
      }
      ownedResourceId = resource.id;
    }

    const timeOff = await prisma.timeOff.create({
      data: {
        userId: (session.user as any).id,
        name: typeof name === 'string' && name.trim() ? name.trim() : null,
        start: startDate,
        end: endDate,
        resourceId: ownedResourceId,
      },
      include: {
        resource: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: timeOff });
  } catch (error) {
    console.error('Error creating time off:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
