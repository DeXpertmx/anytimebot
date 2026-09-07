import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { slotEnd } from '@/lib/polls';

export const dynamic = 'force-dynamic';

async function findOwned(id: string, userId: string) {
  return prisma.availabilityPoll.findFirst({
    where: { id, userId },
    include: {
      slots: {
        include: {
          votes: {
            include: { participant: { select: { id: true, name: true, email: true } } },
          },
        },
        orderBy: { startTime: 'asc' },
      },
      _count: { select: { participants: true, slots: true } },
    },
  });
}

// GET /api/polls/[id] — full poll with votes for the dashboard results view.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const poll = await findOwned(params.id, userId);
    if (!poll) {
      return NextResponse.json({ success: false, error: 'Poll not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: poll });
  } catch (error) {
    console.error('Error fetching poll:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

function parseSlotStarts(rawSlots: unknown): { ok: boolean; starts?: Date[]; error?: string } {
  if (!Array.isArray(rawSlots)) return { ok: false, error: 'Invalid slots' };
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
  if (starts.length < 2) {
    return { ok: false, error: 'Add at least two date/time options' };
  }
  return { ok: true, starts };
}

// PATCH /api/polls/[id] — edit fields, replace the slot list while OPEN, or
// open/close the poll. Replacing slots erases their votes (cascade).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const existing = await findOwned(params.id, userId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Poll not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = (body.title as string)?.trim();
      if (!title) return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
      data.title = title;
    }
    if (body.description !== undefined) data.description = (body.description as string)?.trim() || null;
    if (body.meetingUrl !== undefined) data.meetingUrl = (body.meetingUrl as string)?.trim() || null;
    if (body.durationMinutes !== undefined) {
      data.durationMinutes = Math.max(5, parseInt(body.durationMinutes, 10) || 30);
    }
    if (body.timezone !== undefined) data.timezone = (body.timezone as string) || 'UTC';
    if (body.status !== undefined) {
      if (body.status !== 'OPEN' && body.status !== 'CLOSED') {
        return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
      }
      data.status = body.status;
    }

    const wantsSlots = body.slots !== undefined;
    if (wantsSlots && existing.status === 'CLOSED') {
      return NextResponse.json(
        { success: false, error: 'Open the poll before editing its options' },
        { status: 409 },
      );
    }

    const poll = await prisma.$transaction(async (tx) => {
      if (wantsSlots) {
        const parsed = parseSlotStarts(body.slots);
        if (!parsed.ok || !parsed.starts) {
          throw new Error(parsed.error || 'Invalid slots');
        }
        const duration = (data.durationMinutes as number) ?? existing.durationMinutes;
        await tx.pollSlot.deleteMany({ where: { pollId: existing.id } });
        await tx.pollSlot.createMany({
          data: parsed.starts.map((start) => ({
            pollId: existing.id,
            startTime: start,
            endTime: slotEnd(start, duration),
          })),
        });
      }
      return tx.availabilityPoll.update({
        where: { id: existing.id },
        data,
        include: {
          slots: { include: { _count: { select: { votes: true } } }, orderBy: { startTime: 'asc' } },
        },
      });
    });

    return NextResponse.json({ success: true, data: poll });
  } catch (error: any) {
    console.error('Error updating poll:', error);
    const message = error?.message || 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: message.includes('two') ? 400 : 500 });
  }
}

// DELETE /api/polls/[id]
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;
    const existing = await prisma.availabilityPoll.findFirst({ where: { id: params.id, userId } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Poll not found' }, { status: 404 });
    }
    await prisma.availabilityPoll.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting poll:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
