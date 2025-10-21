
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
export const dynamic = 'force-dynamic';

import { getUserUsageStats } from '@/lib/usage-tracker';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stats = await getUserUsageStats(session.user.id);

    if (!stats) {
      return NextResponse.json({ error: 'Usage stats not found' }, { status: 404 });
    }

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Get usage stats error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
