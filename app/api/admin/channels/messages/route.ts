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
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(searchParams.get('pageSize') || '25', 10) || 25, 5), 100);
    const phone = searchParams.get('phone')?.trim() || undefined;
    const status = searchParams.get('status')?.trim().toUpperCase() || undefined;

    const where: any = { userId: null };
    if (phone) where.phone = { contains: phone, mode: 'insensitive' };
    if (status) where.status = status;

    const [messages, total] = await Promise.all([
      prisma.whatsAppMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
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
      }),
      prisma.whatsAppMessage.count({ where }),
    ]);

    return NextResponse.json({
      messages,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.max(Math.ceil(total / pageSize), 1),
      },
    });
  } catch (error: any) {
    console.error('Admin system messages API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch messages' },
      { status: error.message === 'Unauthorized: Admin access required' ? 403 : 500 },
    );
  }
}
