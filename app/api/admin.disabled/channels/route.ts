
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await requireAdmin();
    
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { whatsappEnabled: true },
        ],
      },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        whatsappEnabled: true,
        whatsappPhone: true,
        evolutionInstanceName: true,
      },
      orderBy: {
        email: 'asc',
      },
    });
    
    return NextResponse.json({ users });
  } catch (error: any) {
    console.error('Admin channels API error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch channels' },
      { status: error.message === 'Unauthorized: Admin access required' ? 403 : 500 }
    );
  }
}
