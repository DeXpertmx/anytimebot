export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getWhatsAppConnectionState } from '@/lib/whatsapp-manager';

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

    const result = await getWhatsAppConnectionState(userId);

    // Provide the configured business number (if any) so the dashboard can
    // show a neutral "Número del negocio" without exposing internal tooling.
    const { prisma } = await import('@/lib/db');
    const record = await prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappPhone: true },
    });

    return NextResponse.json({ ...result, phone: record?.whatsappPhone || null });
  } catch (error) {
    console.error('Error getting WhatsApp status:', error);
    return NextResponse.json(
      { error: 'Failed to get WhatsApp status' },
      { status: 500 }
    );
  }
}