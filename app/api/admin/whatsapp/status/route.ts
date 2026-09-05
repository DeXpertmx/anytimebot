export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/admin';
import { getSystemWhatsAppStatus } from '@/lib/system-whatsapp';

export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
    }
    const status = await getSystemWhatsAppStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error getting system WhatsApp status:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to get WhatsApp status' },
      { status: 500 },
    );
  }
}
