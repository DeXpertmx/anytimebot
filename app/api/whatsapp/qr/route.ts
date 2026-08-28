export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getWhatsAppQr } from '@/lib/whatsapp-manager';

export async function GET() {
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

    const existing = await getWhatsAppQr(userId);
    if (!existing) {
      // No instance created yet -> tell the client it must activate first.
      return NextResponse.json({ error: 'WhatsApp not activated', needActivate: true }, { status: 404 });
    }

    return NextResponse.json({ success: true, qr: existing });
  } catch (error) {
    console.error('Error getting WhatsApp QR:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to get WhatsApp QR' },
      { status: 500 }
    );
  }
}