
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/routing/insights?eventTypeId=xxx - Get routing insights
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const eventTypeId = searchParams.get('eventTypeId');

    if (!eventTypeId) {
      return NextResponse.json(
        { success: false, error: 'Event type ID is required' },
        { status: 400 }
      );
    }

    // Verify event type belongs to user
    const eventType = await prisma.eventType.findFirst({
      where: {
        id: eventTypeId,
        bookingPage: {
          userId: (session.user as any).id,
        },
      },
      include: {
        routingResponses: {
          include: {
            booking: {
              include: {
                assignedMember: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        team: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    if (!eventType.formSchema || !eventType.enableRouting) {
      return NextResponse.json(
        { success: false, error: 'Routing forms not enabled for this event type' },
        { status: 400 }
      );
    }

    // Calculate insights
    const formSchema: any = eventType.formSchema;
    const questions = formSchema.questions || [];

    // Response counts per question
    const responseCounts: Record<string, Record<string, number>> = {};
    questions.forEach((q: any) => {
      responseCounts[q.id] = {};
    });

    // Assignment accuracy
    const assignmentStats: Record<string, { total: number; members: Record<string, number> }> = {};

    eventType.routingResponses.forEach((response) => {
      const responses: Record<string, any> = response.responses as any;
      const assignedMemberId = response.booking.assignedMemberId;

      Object.entries(responses).forEach(([questionId, answer]) => {
        if (!responseCounts[questionId]) {
          responseCounts[questionId] = {};
        }

        const answerKey = Array.isArray(answer) ? answer.join(', ') : String(answer);
        responseCounts[questionId][answerKey] = (responseCounts[questionId][answerKey] || 0) + 1;

        // Track assignment per answer
        if (!assignmentStats[answerKey]) {
          assignmentStats[answerKey] = { total: 0, members: {} };
        }
        assignmentStats[answerKey].total += 1;
        if (assignedMemberId) {
          assignmentStats[answerKey].members[assignedMemberId] =
            (assignmentStats[answerKey].members[assignedMemberId] || 0) + 1;
        }
      });
    });

    // Calculate assignment accuracy percentages
    const assignmentAccuracy = Object.entries(assignmentStats).map(([answer, stats]) => {
      const topMember = Object.entries(stats.members).reduce(
        (max, [memberId, count]) => {
          return count > max.count ? { memberId, count } : max;
        },
        { memberId: '', count: 0 }
      );

      const accuracy = stats.total > 0 ? (topMember.count / stats.total) * 100 : 0;
      const member = eventType.team?.members.find((m) => m.user?.id === topMember.memberId);

      return {
        answer,
        totalResponses: stats.total,
        topAssignedMember: member?.user || null,
        assignmentCount: topMember.count,
        accuracy: Math.round(accuracy),
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        totalResponses: eventType.routingResponses.length,
        questions: questions.map((q: any) => ({
          id: q.id,
          text: q.text,
          type: q.type,
          responseCounts: responseCounts[q.id] || {},
        })),
        assignmentAccuracy,
      },
    });
  } catch (error) {
    console.error('Error fetching routing insights:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
