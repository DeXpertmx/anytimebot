import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/integrations/teams/disconnect
 * Removes the tenant's Teams connection (tokens are deleted).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  await prisma.integrationConnection.deleteMany({
    where: { userId, provider: 'teams' },
  });

  return NextResponse.json({ success: true });
}