export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { deleteWhatsAppInstance, disconnectWhatsAppInstance } from '@/lib/whatsapp-manager';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;
    const userId = user.id || user.sub;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let permanent = false;
    try {
      const body = await req.json();
      permanent = body?.permanent === true;
    } catch {
      permanent = false;
    }

    if (permanent) {
      await deleteWhatsAppInstance(userId);
    } else {
      await disconnectWhatsAppInstance(userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting WhatsApp:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to disconnect WhatsApp' },
      { status: 500 }
    );
  }
}