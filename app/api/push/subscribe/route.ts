import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function currentUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
    const p256dh = typeof body?.keys?.p256dh === 'string' ? body.keys.p256dh : '';
    const auth = typeof body?.keys?.auth === 'string' ? body.keys.auth : '';
    if (!endpoint || !p256dh || !auth || endpoint.length > 4096) {
      return NextResponse.json({ success: false, error: 'Invalid push subscription' }, { status: 400 });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth, userAgent: request.headers.get('user-agent') },
      update: { userId, p256dh, auth, userAgent: request.headers.get('user-agent') },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push subscription error:', error);
    return NextResponse.json({ success: false, error: 'Unable to save push subscription' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    if (typeof body?.endpoint !== 'string' || !body.endpoint) {
      return NextResponse.json({ success: false, error: 'Endpoint is required' }, { status: 400 });
    }
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint: body.endpoint } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json({ success: false, error: 'Unable to remove push subscription' }, { status: 500 });
  }
}