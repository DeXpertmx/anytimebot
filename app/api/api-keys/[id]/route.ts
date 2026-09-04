import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// DELETE /api/api-keys/[id] - revoke (soft delete) an API key
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const apiKey = await prisma.apiKey.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    if (!apiKey || apiKey.userId !== userId) {
      return NextResponse.json({ success: false, error: 'API key not found' }, { status: 404 });
    }

    await prisma.apiKey.update({
      where: { id: params.id },
      data: { revokedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error revoking API key:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
