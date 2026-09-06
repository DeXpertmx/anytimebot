import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVideoConnectionsStatus } from '@/lib/video-providers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/video/status
 * Returns the tenant's Zoom/Teams connection status for the Integraciones UI.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const userId = (session.user as any).id as string;

  const status = await getVideoConnectionsStatus(userId);
  return NextResponse.json({ success: true, data: status });
}