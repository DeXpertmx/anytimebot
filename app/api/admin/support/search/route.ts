
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json({ results: [] });
    }
    
    // Search users by email or name
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        _count: {
          select: {
            bookings: true,
          },
        },
      },
      take: 10,
    });
    
    const results = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      bookingsCount: user._count.bookings,
    }));
    
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Admin search API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to search' },
      { status: error.message === 'Unauthorized: Admin access required' ? 403 : 500 }
    );
  }
}
