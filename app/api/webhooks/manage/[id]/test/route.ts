import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import crypto from 'crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { signPayload } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 10_000;

/**
 * POST /api/webhooks/manage/[id]/test
 * Sends a `ping` event to the endpoint so the user can verify their receiver
 * before real booking events start flowing. Signed exactly like real events;
 * not persisted in the delivery log (it is a ping, not a booking event).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: { id: params.id, userId },
      select: { id: true, url: true, secret: true },
    });
    if (!endpoint) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });
    }

    const payload = {
      event: 'ping',
      created_at: new Date().toISOString(),
      data: {
        message:
          'Test event from Anytimebot. If you received this with a valid signature, your webhook is configured correctly.',
      },
    };
    const rawBody = JSON.stringify(payload);
    const deliveryId = `ping_${crypto.randomBytes(12).toString('hex')}`;

    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Anytimebot-Webhooks/1.0',
          'X-Anytimebot-Event': 'ping',
          'X-Anytimebot-Signature': signPayload(endpoint.secret, rawBody),
          'X-Anytimebot-Delivery-Id': deliveryId,
        },
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const bodyPreview = (await response.text().catch(() => '')).slice(0, 200);
      const ok = response.status >= 200 && response.status < 300;
      return NextResponse.json({
        success: ok,
        status: response.status,
        durationMs,
        bodyPreview: bodyPreview || undefined,
      });
    } catch (netError) {
      const isAbort = netError instanceof Error && netError.name === 'AbortError';
      return NextResponse.json({
        success: false,
        error: isAbort
          ? `No response within ${TIMEOUT_MS / 1000}s`
          : netError instanceof Error
            ? netError.message
            : String(netError),
        durationMs: Date.now() - startedAt,
      });
    }
  } catch (error) {
    console.error('Error sending webhook test event:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
