import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor, requireCapability, errorResponse, readJson } from '@/lib/api-payments';
import { orderBalanceCents, orderTotalCents, formatReceiptNumber, voidOrder } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/[id] — order detail with payments, items, receipt number and
 * drawer movements that reference it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'reports');
    if (denied) return denied;

    const order = await prisma.order.findFirst({
      where: { id: params.id, userId: actor!.userId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'asc' } },
        receipt: { select: { series: true, number: true, issuedAt: true } },
        booking: { select: { id: true, guestName: true, startTime: true } },
        customer: { select: { id: true, name: true, email: true } },
      },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Venta no encontrada' }, { status: 404 });
    }

    const movements = await prisma.cashMovement.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...order,
        balance: orderBalanceCents(orderTotalCents(order.items), order.payments),
        receiptNumber: order.receipt
          ? formatReceiptNumber(order.receipt.series, order.receipt.number, order.receipt.issuedAt)
          : null,
        movements,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/orders/[id]/void — body { reason }. Blocked while the order keeps
 * effectively collected money (annul/refund first).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'annul');
    if (denied) return denied;

    const body = await readJson(request);
    const updated = await voidOrder(params.id, actor!.userId, String(body.reason ?? ''), {
      id: actor!.userId,
      name: actor!.name,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
