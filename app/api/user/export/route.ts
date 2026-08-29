export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { exportUserData } from '@/lib/data-export';

/**
 * GET /api/user/export
 * Returns the authenticated user's personal data as a portable JSON file.
 * Secrets and authentication tokens are intentionally excluded.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = (session?.user as any) ?? null;
    const userId = user?.id || user?.sub;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await exportUserData(userId);
    if (!data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const email = String(data.account.email).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'user';
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="anytimebot-data-${email}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error exporting user data:', error);
    return NextResponse.json({ error: 'Failed to export personal data' }, { status: 500 });
  }
}