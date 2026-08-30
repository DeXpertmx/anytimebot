import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// DELETE /api/time-off/[id] - remove an absence block (owner only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const timeOff = await prisma.timeOff.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });

    if (!timeOff || timeOff.userId !== (session.user as any).id) {
      return NextResponse.json(
        { success: false, error: 'Time off not found' },
        { status: 404 }
      );
    }

    await prisma.timeOff.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting time off:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
