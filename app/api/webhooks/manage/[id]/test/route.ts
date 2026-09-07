import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import crypto from 'crypto';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { signPayload, buildMeetingPayload } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 10_000;

type TestEvent = 'ping' | 'meeting.created' | 'meeting.failed';

/**
 * POST /api/webhooks/manage/[id]/test
 * Sends a test event to the endpoint so the user can verify their receiver
 * without creating a real booking. Body: { event?: 'ping' | 'meeting.created'
 * | 'meeting.failed' } (default 'ping'). Signed exactly like real events and
 * NOT persisted in the delivery log (it is a test, not a real event).
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

    const body = await request.json().catch(() => ({}));
    const event: TestEvent =
      body.event === 'meeting.created' || body.event === 'meeting.failed' ? body.event : 'ping';

    // Build a realistic payload for the chosen event so the receiver can
    // validate parsing and signature handling against the real shape.
    const sampleBookingId = `test_${crypto.randomBytes(6).toString('hex')}`;
    let payload: Record<string, unknown>;
    if (event === 'meeting.created') {
      payload = buildMeetingPayload('meeting.created', {
        bookingId: sampleBookingId,
        provider: 'zoom',
        success: true,
        roomUrl: 'https://zoom.us/j/1234567890',
        meetingId: '1234567890',
      });
    } else if (event === 'meeting.failed') {
      payload = buildMeetingPayload('meeting.failed', {
        bookingId: sampleBookingId,
        provider: 'zoom',
        success: false,
        error: 'Zoom app not configured (test event)',
      });
    } else {
      payload = {
        event: 'ping',
        created_at: new Date().toISOString(),
        data: {
          message:
            'Test event from Anytimebot. If you received this with a valid signature, your webhook is configured correctly.',
        },
      };
    }
    const rawBody = JSON.stringify(payload);

    const deliveryId = `test_${crypto.randomBytes(12).toString('hex')}`;

    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Anytimebot-Webhooks/1.0',
          'X-Anytimebot-Event': event,
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
