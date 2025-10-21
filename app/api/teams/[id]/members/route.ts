
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/teams/[id]/members - Get all members of a team
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
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

    const members = await prisma.teamMember.findMany({
      where: {
        teamId: params.id,
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
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: members,
    });
  } catch (error) {
    console.error('Error fetching team members:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/teams/[id]/members - Add a new member to the team
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
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
    const { email, timezone, skills, languages, role } = body;

    if (!email) {
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if member already exists
    const existingMember = await prisma.teamMember.findUnique({
      where: {
        teamId_email: {
          teamId: params.id,
          email,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: 'Member already exists in this team' },
        { status: 400 }
      );
    }

    // Check if user exists in the system
    const user = await prisma.user.findUnique({
      where: { email },
    });

    const member = await prisma.teamMember.create({
      data: {
        teamId: params.id,
        email,
        userId: user?.id,
        timezone: timezone || 'UTC',
        skills: skills || [],
        languages: languages || [],
        role: role || 'MEMBER',
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
    console.error('Error adding team member:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
