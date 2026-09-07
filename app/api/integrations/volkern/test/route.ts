import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { signVolkernPayload } from '@/lib/volkern';

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 10_000;

/**
 * POST /api/integrations/volkern/test
 * Sends a signed ping event to the configured Volkern webhook receiver so the
 * user can validate the endpoint (URL + HMAC secret) without creating a real
 * booking or bot message. Not persisted anywhere on the Anytimebot side.
 */
export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const integration = await prisma.volkernIntegration.findUnique({
      where: { userId: user.id },
    });
    if (!integration || !integration.activo) {
      return NextResponse.json(
        { success: false, error: 'La integración con Volkern no está configurada o está inactiva' },
        { status: 400 },
      );
    }

    const baseUrl = integration.baseUrl.replace(/\/$/, '');
    const payload = {
      event: 'ping',
      created_at: new Date().toISOString(),
      data: {
        message:
          'Test event from Anytimebot. If you received this with a valid signature, your Volkern webhook is configured correctly.',
      },
    };
    const rawBody = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Anytimebot-Webhooks/1.0',
      'x-webhook-id': `test_${crypto.randomUUID()}`,
      'x-webhook-event': 'ping',
    };
    if (integration.webhookSecret) {
      headers['x-webhook-signature'] = signVolkernPayload(integration.webhookSecret, rawBody);
    }

    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(`${baseUrl}/api/webhooks/anytimebot`, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      const bodyPreview = (await response.text().catch(() => '')).slice(0, 300);
      const ok = response.status >= 200 && response.status < 300;
      return NextResponse.json({
        success: ok,
        status: response.status,
        durationMs,
        bodyPreview: bodyPreview || undefined,
        signed: !!integration.webhookSecret,
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
    console.error('Error sending Volkern test event:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}