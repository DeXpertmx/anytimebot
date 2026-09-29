import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor, requireCapability, errorResponse, readJson } from '@/lib/api-payments';
import { addPaymentToOrder, annulPayment, refundPayment } from '@/lib/payments';
import { orderBalanceCents, orderTotalCents, formatReceiptNumber } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders/[id]/payments — payment history of one order.
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
      },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Venta no encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        payments: order.payments,
        balance: orderBalanceCents(orderTotalCents(order.items), order.payments),
        receiptNumber: order.receipt
          ? formatReceiptNumber(order.receipt.series, order.receipt.number, order.receipt.issuedAt)
          : null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/orders/[id]/payments — add a payment (total or partial).
 *
 * Body: { method, amountCents, reference?, idempotencyKey? }
 * Idempotent: repeating the same idempotencyKey returns the original payment
 * instead of charging twice.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'collect');
    if (denied) return denied;

    const body = await readJson(request);
    const { payment, idempotentReplay } = await addPaymentToOrder(
      {
        userId: actor!.userId,
        orderId: params.id,
        method: body.method,
        amountCents: body.amountCents,
        reference: body.reference ?? null,
        idempotencyKey: body.idempotencyKey ?? null,
        actor: { id: actor!.userId, name: actor!.name },
      },
    );

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { items: true, payments: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        payment,
        idempotentReplay,
        balance: order ? orderBalanceCents(orderTotalCents(order.items), order.payments) : null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
