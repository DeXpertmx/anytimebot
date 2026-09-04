import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateWebhookSecret, WEBHOOK_EVENTS, type WebhookEvent } from '@/lib/webhooks';

export const dynamic = 'force-dynamic';

const MAX_ENDPOINTS = 5;

function validateUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw);
    // Only https in production; allow http for local development.
    if (url.protocol !== 'https' && process.env.NODE_ENV === 'production') return null;
    if (url.protocol !== 'https' && url.protocol !== 'http') return null;
    return url.toString();
  } catch {
    return null;
  }
}

// GET /api/webhooks - list the current user's webhook endpoints with delivery stats
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
        _count: { select: { deliveries: true } },
        deliveries: {
          select: { status: true },
          where: { status: { in: ['DELIVERED', 'FAILED'] } },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: endpoints.map(({ deliveries, _count, ...e }) => ({
        ...e,
        totalDeliveries: _count.deliveries,
        delivered: deliveries.filter((d) => d.status === 'DELIVERED').length,
        failed: deliveries.filter((d) => d.status === 'FAILED').length,
      })),
    });
  } catch (error) {
    console.error('Error listing webhook endpoints:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/webhooks - create a webhook endpoint. The signing secret is shown ONCE.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = (session.user as any).id;

    const body = await request.json().catch(() => ({}));
    const url = validateUrl(body.url);
    if (!url) {
      return NextResponse.json(
        { success: false, error: 'A valid HTTPS URL is required' },
        { status: 400 },
      );
    }

    // Validate the event subscription list.
    let events = '*';
    if (Array.isArray(body.events) && body.events.length > 0) {
      const valid = body.events.filter((e: unknown): e is WebhookEvent =>
        (WEBHOOK_EVENTS as readonly string[]).includes(e as string),
      );
      if (valid.length !== body.events.length) {
        return NextResponse.json(
          { success: false, error: `Invalid event. Valid: ${WEBHOOK_EVENTS.join(', ')}` },
          { status: 400 },
        );
      }
      events = valid.join(',');
    }

    const existing = await prisma.webhookEndpoint.count({ where: { userId } });
    if (existing >= MAX_ENDPOINTS) {
      return NextResponse.json(
        { success: false, error: `Webhook endpoint limit reached (${MAX_ENDPOINTS})` },
        { status: 403 },
      );
    }

    const secret = generateWebhookSecret();
    const endpoint = await prisma.webhookEndpoint.create({
      data: { userId, url, secret, events },
      select: { id: true, url: true, events: true, createdAt: true },
    });

    return NextResponse.json({ success: true, data: { ...endpoint, secret } }, { status: 201 });
  } catch (error) {
    console.error('Error creating webhook endpoint:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
