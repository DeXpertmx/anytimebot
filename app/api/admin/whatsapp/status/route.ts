export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getSystemWhatsAppStatus } from '@/lib/system-whatsapp';

export async function GET() {
  try {
    await requireAdmin();
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
