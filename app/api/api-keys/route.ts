import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateApiKey } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

// GET /api/api-keys - list the current user's API keys (never returns the raw key)
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const keys = await prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        requestCount: true,
        revokedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: keys });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/api-keys - create a new API key. The raw key is returned ONCE.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 60) : 'API key';

    // Plan limit: BASIC founders plan gets 1 key, others up to 5
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    const limit = user?.plan === 'BASIC' ? 1 : 5;
    const existing = await prisma.apiKey.count({ where: { userId, revokedAt: null } });
    if (existing >= limit) {
      return NextResponse.json(
        { success: false, error: `API key limit reached (${limit}). Revoke one first.` },
        { status: 403 }
      );
    }

    const { key, hash, prefix } = generateApiKey();
    const apiKey = await prisma.apiKey.create({
      data: { userId, name, keyHash: hash, prefix },
      select: { id: true, name: true, prefix: true, createdAt: true },
    });

    return NextResponse.json({ success: true, data: { ...apiKey, key } });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
