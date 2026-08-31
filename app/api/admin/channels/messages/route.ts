import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Messages sent from the system notification number (Anytimebot-exclusive).
 * Platform-level messages are stored with `userId: null`.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10) || 100, 200);

    const messages = await prisma.whatsAppMessage.findMany({
      where: { userId: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        phone: true,
        message: true,
        direction: true,
        status: true,
        provider: true,
        bookingId: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ messages });
  } catch (error: any) {
    console.error('Admin system messages API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch messages' },
      { status: error.message === 'Unauthorized: Admin access required' ? 403 : 500 },
    );
  }
}
