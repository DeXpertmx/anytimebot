import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET /api/v1/me - account info for the authenticated API key
export async function GET(request: NextRequest) {
  const auth = await authenticateApiKey(request);
  if (!auth) {
    return NextResponse.json(
      { success: false, error: 'unauthorized', message: 'Invalid or missing API key' },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      name: true,
      email: true,
      plan: true,
      username: true,
      timezone: true,
      currency: true,
      country: true,
    },
  });

  if (!user) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      plan: user.plan,
      timezone: user.timezone,
      currency: user.currency,
      country: user.country,
    },
  });
}
