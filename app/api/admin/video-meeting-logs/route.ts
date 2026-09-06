export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { prisma } from '@/lib/db';

/**
 * GET /api/admin/video-meeting-logs?limit=50&cursor=...
 * Returns the Zoom/Teams meeting creation audit trail (newest first), with the
 * owner's email, booking id, provider, success/failure, room url and error.
 * Admin-only.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const rawLimit = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const cursor = searchParams.get('cursor') || '';
    const provider = searchParams.get('provider') || '';
    const success = searchParams.get('success'); // 'true' | 'false'

    const where = {
      ...(provider ? { provider } : {}),
      ...(success === 'true' || success === 'false' ? { success: success === 'true' } : {}),
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.videoMeetingLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      prisma.videoMeetingLog.count({ where }),
    ]);

    return NextResponse.json({
      logs: logs.map((entry) => ({
        id: entry.id,
        provider: entry.provider,
        success: entry.success,
        roomUrl: entry.roomUrl,
        meetingId: entry.meetingId,
        error: entry.error,
        bookingId: entry.bookingId,
        userEmail: entry.user.email,
        userName: entry.user.name,
        createdAt: entry.createdAt,
      })),
      total,
      nextCursor: logs.length === limit ? logs[logs.length - 1].createdAt.toISOString() : null,
    });
  } catch (error: any) {
    console.error('Error al leer los registros de reuniones:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudieron leer los registros de reuniones' },
      { status: 500 },
    );
  }
}