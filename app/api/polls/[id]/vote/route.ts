import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import {
  participantLookupKey,
  validSlotIds,
  aggregateSlotTallies,
} from '@/lib/polls';

export const dynamic = 'force-dynamic';

/**
 * POST /api/polls/[id]/vote — public. A participant submits the slot ids they
 * can attend. Re-submitting with the same name/email replaces their previous
 * answer (a participant can change their availability any time while OPEN).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const name = (body.name as string)?.trim();
    const email = (body.email as string)?.trim().toLowerCase() || null;
    if (!name) {
      return NextResponse.json({ success: false, error: 'Name is required' }, { status: 400 });
    }

    const poll = await prisma.availabilityPoll.findUnique({
      where: { id: params.id },
      include: { slots: { select: { id: true } } },
    });
    if (!poll) {
      return NextResponse.json({ success: false, error: 'Poll not found' }, { status: 404 });
    }
    if (poll.status !== 'OPEN') {
      return NextResponse.json(
        { success: false, error: 'This poll is no longer open' },
        { status: 409 },
      );
    }

    const allowed = poll.slots.map((s) => s.id);
    const slotIds = validSlotIds(body.slots, allowed);
    if (slotIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Choose at least one option' },
        { status: 400 },
      );
    }

    const lookupKey = participantLookupKey(name, email);
    const participant = await prisma.pollParticipant.upsert({
      where: { pollId_lookupKey: { pollId: poll.id, lookupKey } },
      create: { pollId: poll.id, name, email, lookupKey },
      update: { name },
    });

    // Replace the participant's previous answer atomically.
    await prisma.$transaction([
      prisma.pollSlotVote.deleteMany({ where: { participantId: participant.id } }),
      prisma.pollSlotVote.createMany({
        data: slotIds.map((slotId) => ({ participantId: participant.id, slotId })),
      }),
    ]);

    // Return the updated tally so the public page can refresh without a second call.
    const votes = await prisma.pollSlotVote.findMany({
      where: { slotId: { in: allowed } },
      include: { participant: { select: { name: true, email: true } } },
    });
    const tally = aggregateSlotTallies(
      poll.slots.map((s) => s.id),
      votes.map((v) => ({ slotId: v.slotId, participant: v.participant as any })),
    );
    const counts: Record<string, number> = {};
    for (const [id, t] of tally) counts[id] = t.count;

    return NextResponse.json({ success: true, data: { counts } });
  } catch (error) {
    console.error('Error voting on poll:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
