export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getSystemWhatsAppQr } from '@/lib/system-whatsapp';

export async function GET() {
  try {
    await requireAdmin();
    const qr = await getSystemWhatsAppQr();
    if (!qr) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp no activado', needActivate: true },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, qr });
  } catch (error) {
    console.error('Error getting system WhatsApp QR:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to get WhatsApp QR' },
      { status: 500 },
    );
  }
}
