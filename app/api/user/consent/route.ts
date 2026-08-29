export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { withdrawConsent } from '@/lib/consent';

/**
 * GET /api/user/consent
 * List the authenticated user's consent records (audit trail, GDPR Art. 7).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const user = (session?.user as any) ?? null;
    const userId = user?.id || user?.sub;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!me?.email) {
      return NextResponse.json({ consent: [] });
    }

    const consent = await prisma.consentLog.findMany({
      where: { subjectEmail: me.email },
      orderBy: { createdAt: 'desc' },
      select: {
        purpose: true,
        version: true,
        granted: true,
        createdAt: true,
        withdrawnAt: true,
      },
    });

    return NextResponse.json({ consent });
  } catch (error) {
    console.error('Error listing consent:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/user/consent
 * Withdraw a purpose from the authenticated user's own consent (Art. 7(3)).
 * Body: { purpose: "booking" | "recording" | "messaging" }
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const user = (session?.user as any) ?? null;
    const userId = user?.id || user?.sub;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const purpose = String(body?.purpose || '').trim();
    if (!['booking', 'recording', 'messaging', 'terms'].includes(purpose)) {
      return NextResponse.json({ error: 'Invalid purpose' }, { status: 400 });
    }

    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!me?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const ok = await withdrawConsent(me.email, purpose);
    if (!ok) {
      return NextResponse.json({ error: 'Failed to withdraw consent' }, { status: 500 });
    }

    return NextResponse.json({ success: true, purpose, withdrawnAt: new Date() });
  } catch (error) {
    console.error('Error withdrawing consent:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}