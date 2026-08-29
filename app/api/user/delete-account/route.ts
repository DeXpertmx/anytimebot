export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { deleteWhatsAppInstance } from '@/lib/whatsapp-manager';
import { eraseUserBotData } from '@/lib/convex-server';

/**
 * POST /api/user/delete-account
 *
 * Permanently deletes the authenticated user's account and all associated
 * data, satisfying the right to erasure (GDPR Art. 17):
 *  - cleans up external providers (WhatsApp instance, Twilio)
 *  - erases bot data stored in Convex
 *  - deletes the Prisma user (cascades to all Postgres relations)
 */
export async function POST() {
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

    // 1) Clean up the managed WhatsApp instance (if any) so the external
    //    messaging service doesn't keep processing messages for this user.
    try {
      const record = await prisma.user.findUnique({
        where: { id: userId },
        select: { evolutionInstanceName: true, twilioAccountSid: true },
      });

      if (record?.evolutionInstanceName) {
        await deleteWhatsAppInstance(userId);
      }
      // Twilio uses per-account manual keys; nothing to destroy remotely.
    } catch (e) {
      console.error('Failed to clean WhatsApp instance during erasure:', e);
      // Continue: Postgres+Convex erasure must still happen.
    }

    // 2) Erase bot conversations/events in Convex.
    const convexResult = await eraseUserBotData(userId);

    // 3) Delete the user row. All Postgres relations cascade (Bookings,
    //    Bots, BookingPages, Teams, Events, Messages, Sessions, etc.).
    await prisma.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true, convex: convexResult });
  } catch (error) {
    console.error('Error deleting account:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to delete account' },
      { status: 500 }
    );
  }
}