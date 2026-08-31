export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { disconnectSystemWhatsApp } from '@/lib/system-whatsapp';

export async function POST(req: Request) {
  try {
    await requireAdmin();

    let permanent = false;
    try {
      const body = await req.json();
      permanent = body?.permanent === true;
    } catch {
      permanent = false;
    }

    await disconnectSystemWhatsApp(permanent);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error disconnecting system WhatsApp:', error);
    return NextResponse.json(
      { success: false, error: (error as Error).message || 'Failed to disconnect WhatsApp' },
      { status: 500 },
    );
  }
}
