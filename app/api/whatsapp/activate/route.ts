export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createWhatsAppConnection, getWhatsAppQr } from '@/lib/whatsapp-manager';

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

    // Determine public origin from the incoming request, falling back to env.
    const url = new URL(req.url);
    const origin = url.origin;

    const { instanceName } = await createWhatsAppConnection(userId, origin);

    // Attempt to fetch QR right after activation (returns immediately if pairable).
    let qr: { base64: string; code?: string | null; pairingCode?: string | null } | null = null;
    try {
      qr = await getWhatsAppQr(userId);
    } catch (e) {
      qr = null;
    }

    return NextResponse.json({ success: true, instanceName, qr });
  } catch (error) {
    console.error('Error activating WhatsApp:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to activate WhatsApp' },
      { status: 500 }
    );
  }
}