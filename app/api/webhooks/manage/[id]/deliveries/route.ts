import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/webhooks/manage/[id]/deliveries - delivery history for one endpoint
export async function GET(
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
      select: { id: true },
    });
    if (!endpoint) {
      return NextResponse.json({ success: false, error: 'Webhook not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10) || 20));

    const [deliveries, total] = await Promise.all([
      prisma.webhookDelivery.findMany({
        where: { endpointId: params.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          eventType: true,
          status: true,
          attempts: true,
          responseStatus: true,
          lastError: true,
          deliveredAt: true,
          createdAt: true,
        },
      }),
      prisma.webhookDelivery.count({ where: { endpointId: params.id } }),
    ]);

    return NextResponse.json({
      success: true,
      data: deliveries.map((d) => ({
        ...d,
        // Serialize dates for the client component
        createdAt: d.createdAt.toISOString(),
        deliveredAt: d.deliveredAt?.toISOString() ?? null,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Error listing webhook deliveries:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
