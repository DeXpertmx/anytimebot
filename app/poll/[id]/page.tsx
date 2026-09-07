import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { aggregateSlotTallies } from '@/lib/polls';
import { PollVote } from '@/components/public/poll-vote';

export const dynamic = 'force-dynamic';

export default async function PollPage({ params }: { params: { id: string } }) {
  const poll = await prisma.availabilityPoll.findUnique({
    where: { id: params.id },
    include: {
      slots: {
        include: {
          votes: { include: { participant: { select: { name: true, email: true } } } },
        },
        orderBy: { startTime: 'asc' },
      },
    },
  });

  if (!poll) notFound();

  const tallies = aggregateSlotTallies(
    poll.slots.map((s) => s.id),
    poll.slots.flatMap((s) =>
      s.votes.map((v) => ({ slotId: s.id, participant: v.participant })),
    ),
  );

  return (
    <PollVote
      poll={{
        id: poll.id,
        title: poll.title,
        description: poll.description,
        durationMinutes: poll.durationMinutes,
        meetingUrl: poll.meetingUrl,
        status: poll.status,
        timezone: poll.timezone,
        slots: poll.slots.map((s) => ({
          id: s.id,
          startTime: s.startTime.toISOString(),
          endTime: s.endTime.toISOString(),
          count: tallies.get(s.id)?.count ?? 0,
          voters: tallies.get(s.id)?.names ?? [],
        })),
      }}
    />
  );
}
