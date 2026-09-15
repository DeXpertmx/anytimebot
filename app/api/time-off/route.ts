import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { resolveBlockRange } from '@/lib/time-off';

export const dynamic = 'force-dynamic';

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

// POST /api/time-off - create an absence: whole days (default) or a time range.
//
// Body:
//   { name?, start, end, resourceId?, allDay? }
//   - allDay === undefined/true → `start`/`end` are dates (YYYY-MM-DD) and the
//     whole days are blocked (existing behaviour).
//   - allDay === false → `start`/`end` are ISO datetimes with offset
//     ("2026-09-20T14:00:00.000Z"), so the client's local hours are honoured
//     instead of being read as server-local time.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, start, end, resourceId, allDay } = body;

    const parsedRange = resolveBlockRange({ start, end, allDay });
    if (!parsedRange.ok) {
      return NextResponse.json({ success: false, error: parsedRange.error }, { status: 400 });
    }
    const { start: startDate, end: endDate, partial } = parsedRange.range;

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
        allDay: !partial,
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
