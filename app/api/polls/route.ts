import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slotEnd } from '@/lib/polls';

export const dynamic = 'force-dynamic';

// GET /api/polls — my availability polls with participant/slot counts.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const polls = await prisma.availabilityPoll.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { slots: true, participants: true } },
        slots: {
          include: { _count: { select: { votes: true } } },
          orderBy: { startTime: 'asc' },
        },
      },
    });

    return NextResponse.json({ success: true, data: polls });
  } catch (error) {
    console.error('Error listing polls:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/polls — create a poll with its proposed slots (ISO start times).
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const body = await request.json();
    const title = (body.title as string)?.trim();
    const description = (body.description as string)?.trim() || null;
    const durationMinutes = Math.max(5, parseInt(body.durationMinutes, 10) || 30);
    const meetingUrl = (body.meetingUrl as string)?.trim() || null;
    const timezone = (body.timezone as string) || 'UTC';
    const rawSlots = Array.isArray(body.slots) ? body.slots : [];

    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }
    // Deduplicate by ISO start time keeping order.
    const seen = new Set<string>();
    const starts: Date[] = [];
    for (const raw of rawSlots) {
      if (typeof raw !== 'string') continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;
      const key = d.toISOString();
      if (seen.has(key)) continue;
      seen.add(key);
      starts.push(d);
    }
    if (starts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one date/time option is required' },
        { status: 400 },
      );
    }
    // At least 2 options is what makes it a poll; allow 1 for edge cases.
    if (starts.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Add at least two date/time options' },
        { status: 400 },
      );
    }

    const poll = await prisma.availabilityPoll.create({
      data: {
        userId,
        title,
        description,
        durationMinutes,
        meetingUrl,
        timezone,
        status: 'OPEN',
        slots: {
          create: starts.map((start) => ({
            startTime: start,
            endTime: slotEnd(start, durationMinutes),
          })),
        },
      },
      include: { slots: { orderBy: { startTime: 'asc' } } },
    });

    return NextResponse.json({ success: true, data: poll });
  } catch (error) {
    console.error('Error creating poll:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
