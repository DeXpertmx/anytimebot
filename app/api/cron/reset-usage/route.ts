
import { NextRequest, NextResponse } from 'next/server';
import { resetMonthlyUsage } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await resetMonthlyUsage();

    return NextResponse.json({ success: true, message: 'Usage reset completed' });
  } catch (error: any) {
    console.error('Reset usage cron error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
