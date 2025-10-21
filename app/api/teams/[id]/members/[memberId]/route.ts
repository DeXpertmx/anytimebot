
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PATCH /api/teams/[id]/members/[memberId] - Update a team member
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify team ownership
    const team = await prisma.team.findFirst({
      where: {
        id: params.id,
        ownerId: (session.user as any).id,
      },
    });

    if (!team) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { timezone, skills, languages, role, isActive } = body;

    const member = await prisma.teamMember.update({
      where: { id: params.memberId },
      data: {
        ...(timezone && { timezone }),
        ...(skills !== undefined && { skills }),
        ...(languages !== undefined && { languages }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            timezone: true,
            calendarSyncEnabled: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: member,
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/teams/[id]/members/[memberId] - Remove a team member
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify team ownership
    const team = await prisma.team.findFirst({
      where: {
        id: params.id,
        ownerId: (session.user as any).id,
      },
    });

    if (!team) {
      return NextResponse.json(
        { success: false, error: 'Team not found' },
        { status: 404 }
      );
    }

    await prisma.teamMember.delete({
      where: { id: params.memberId },
    });

    return NextResponse.json({
      success: true,
      message: 'Team member removed successfully',
    });
  } catch (error) {
    console.error('Error removing team member:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
