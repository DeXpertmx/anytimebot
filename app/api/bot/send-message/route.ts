export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma as db } from '@/lib/db';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

/**
 * Send a WhatsApp message from the bot owner's number.
 *
 * Volkern CRM calls POST /api/bot/send-message with
 *   { username, to, message, messageType, mediaUrl }
 * and expects { success, messageId }.
 *
 * The user is resolved by Anytimebot username; delivery uses the same
 * provider (Evolution / Twilio) the owner configured in Integraciones.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const to = typeof body.to === 'string' ? body.to.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!username || !to || !message) {
      return NextResponse.json(
        { success: false, error: 'username, to and message are required' },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const sent = await sendWhatsAppMessage({
      userId: user.id,
      to,
      message,
    });

    if (!sent) {
      return NextResponse.json(
        { success: false, error: 'WhatsApp no está configurado o el envío falló' },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, messageId: `wa-${Date.now()}` });
  } catch (error) {
    console.error('Error sending message via bot/send-message:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}