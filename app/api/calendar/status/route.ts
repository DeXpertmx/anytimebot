
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getCalendarInfo } from '@/lib/google-calendar';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id;

    // Check if user has a Google account connected
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: 'google',
      },
      select: {
        access_token: true,
        expires_at: true,
      },
    });

    if (!account || !account.access_token) {
      return NextResponse.json({
        connected: false,
        message: 'No Google Calendar connected',
      });
    }

    // Try to get calendar info to verify connection
    try {
      const calendarInfo = await getCalendarInfo(userId);
      return NextResponse.json({
        connected: true,
        calendar: {
          id: calendarInfo.id,
          summary: calendarInfo.summary,
          timeZone: calendarInfo.timeZone,
        },
      });
    } catch (error) {
      return NextResponse.json({
        connected: false,
        error: 'Failed to connect to Google Calendar',
      });
    }
  } catch (error) {
    console.error('Calendar status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
