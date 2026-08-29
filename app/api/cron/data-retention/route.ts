export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { enforceDataRetention } from '@/lib/data-retention';

/**
 * Daily retention cleanup. Vercel Cron authenticates this route with
 * CRON_SECRET; manual calls without the secret are rejected.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await enforceDataRetention();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error enforcing data retention:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}