import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getDailyDomain } from '@/lib/daily';
import { DAILY_PROVIDER } from '@/lib/daily-credentials';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/daily
 * Current tenant's Daily connection (domain, never the key itself).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const connection = await prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId: user.id, provider: DAILY_PROVIDER } },
      select: { accessToken: true, providerAccountId: true, updatedAt: true },
    });

    return NextResponse.json({
      connected: !!connection?.accessToken,
      domain: connection?.providerAccountId || null,
      updatedAt: connection?.updatedAt || null,
      // The platform key lets rooms work without a tenant account, but its
      // 10,000 free minutes are shared by every tenant.
      platformFallback: !!process.env.DAILY_API_KEY,
    });
  } catch (error) {
    console.error('Error fetching Daily config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/integrations/daily
 * Validate and store the tenant's Daily API key.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, email: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await req.json();
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey) {
      return NextResponse.json({ error: 'Introduce tu API key de Daily' }, { status: 400 });
    }

    // Validate against Daily before storing anything.
    const validation = await getDailyDomain(apiKey);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error || 'La API key de Daily no es válida' },
        { status: 400 }
      );
    }

    const connection = await prisma.integrationConnection.upsert({
      where: { userId_provider: { userId: user.id, provider: DAILY_PROVIDER } },
      update: {
        accessToken: apiKey,
        providerAccountId: validation.domain || null,
        accountEmail: user.email,
        accountDisplayName: validation.domain || 'Daily',
      },
      create: {
        userId: user.id,
        provider: DAILY_PROVIDER,
        accessToken: apiKey,
        providerAccountId: validation.domain || null,
        accountEmail: user.email,
        accountDisplayName: validation.domain || 'Daily',
      },
    });

    return NextResponse.json({
      success: true,
      connected: true,
      domain: connection.providerAccountId || null,
    });
  } catch (error) {
    console.error('Error saving Daily config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/integrations/daily
 * Disconnect the tenant's Daily account.
 */
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.integrationConnection.deleteMany({
      where: { userId: user.id, provider: DAILY_PROVIDER },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting Daily:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
