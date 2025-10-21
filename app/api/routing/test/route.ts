
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { assignTeamMember } from '@/lib/team-assignment';

export const dynamic = 'force-dynamic';

// POST /api/routing/test - Test routing assignment
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
    const { eventTypeId, routingFormResponses, startTime, endTime } = body;

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

    // Use provided times or create test times
    const testStartTime = startTime ? new Date(startTime) : new Date(Date.now() + 86400000); // Tomorrow
    const testEndTime = endTime ? new Date(endTime) : new Date(testStartTime.getTime() + eventType.duration * 60000);

    // Test assignment
    const assignedMemberId = await assignTeamMember({
      eventTypeId,
      startTime: testStartTime,
      endTime: testEndTime,
      routingFormResponses,
    });

    const assignedMember = eventType.team?.members.find(
      (m) => m.user?.id === assignedMemberId
    );

    return NextResponse.json({
      success: true,
      data: {
        assignedMemberId,
        assignedMember: assignedMember?.user || null,
        testTime: testStartTime.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error testing routing:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
