import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/invoices — invoices auto-issued when a paid booking is completed.
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id as string;

    const invoices = await prisma.invoice.findMany({
      where: { userId },
      orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
      include: {
        booking: {
          select: { id: true, status: true, startTime: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: invoices });
  } catch (error) {
    console.error('Error listing invoices:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
