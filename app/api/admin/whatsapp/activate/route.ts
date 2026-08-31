export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin, getAdminUser } from '@/lib/admin';
import { activateSystemWhatsApp, getSystemWhatsAppQr } from '@/lib/system-whatsapp';

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin().then(() => getAdminUser());
    const origin = new URL(req.url).origin;

    const { instanceName } = await activateSystemWhatsApp(origin, admin?.email ?? null);

    let qr: { base64: string; code?: string | null; pairingCode?: string | null } | null = null;
    try {
      qr = await getSystemWhatsAppQr();
    } catch (e) {
      qr = null;
    }

    return NextResponse.json({ success: true, instanceName, qr });
  } catch (error) {
    console.error('Error activating system WhatsApp:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to activate WhatsApp' },
      { status: 500 },
    );
  }
}
