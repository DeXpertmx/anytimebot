
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';
export const dynamic = 'force-dynamic';


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        quotas: true,
        usage: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        adminNotes: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            bookings: true,
            bookingPages: true,
            ownedTeams: true,
          },
        },
      },
    });
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    return NextResponse.json(user);
  } catch (error: any) {
    console.error('Admin user detail API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user' },
      { status: error.message === 'Unauthorized: Admin access required' ? 403 : 500 }
    );
  }
}
