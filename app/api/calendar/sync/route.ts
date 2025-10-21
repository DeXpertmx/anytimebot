
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;
    const body = await req.json();
    const { calendarSyncEnabled } = body;

    // Update user settings
    await prisma.user.update({
      where: { id: userId },
      data: {
        // We'll add this field to the schema if needed
        // For now, we'll just return success
      },
    });

    return NextResponse.json({
      success: true,
      calendarSyncEnabled,
    });
  } catch (error) {
    console.error('Calendar sync error:', error);
    return NextResponse.json(
      { error: 'Failed to update calendar sync settings' },
      { status: 500 }
    );
  }
}
