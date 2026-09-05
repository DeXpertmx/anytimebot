export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { setSystemWhatsAppAdminPhone } from '@/lib/system-whatsapp';

export async function POST(req: Request) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
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
