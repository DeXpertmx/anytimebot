export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { setSystemWhatsAppAdminPhone } from '@/lib/system-whatsapp';

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json().catch(() => ({}));
    const phone = typeof body?.phone === 'string' ? body.phone.trim() || null : null;

    await setSystemWhatsAppAdminPhone(phone);
    return NextResponse.json({ success: true, phone });
  } catch (error) {
    console.error('Error saving system WhatsApp admin phone:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to save notification phone' },
      { status: 500 },
    );
  }
}
