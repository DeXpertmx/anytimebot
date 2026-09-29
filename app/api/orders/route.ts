import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor, requireCapability, errorResponse, readJson } from '@/lib/api-payments';
import { createOrder, orderBalanceCents, orderTotalCents, formatReceiptNumber, OrderError } from '@/lib/orders';
import { addPaymentToOrder } from '@/lib/payments';
import { validateOrderItems } from '@/lib/orders';

export const dynamic = 'force-dynamic';

/**
 * GET /api/orders
 *
 * Paginated list of the tenant's orders (quick sales + booking orders) with
 * their payments, so the payments history page can show balance per order.
 * Query: ?page=1&pageSize=20&status=ISSUED|VOID
 */
export async function GET(request: NextRequest) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'reports');
    if (denied) return denied;

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 20) || 20));
    const status = url.searchParams.get('status');

    const where: any = { userId: actor!.userId };
    if (status === 'ISSUED' || status === 'VOID') where.status = status;

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          items: true,
          payments: { orderBy: { createdAt: 'asc' } },
          receipt: { select: { series: true, number: true, issuedAt: true } },
          booking: { select: { id: true, guestName: true, startTime: true } },
          customer: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const data = orders.map((order) => {
      const balance = orderBalanceCents(orderTotalCents(order.items), order.payments);
      return {
        ...order,
        balance,
        receiptNumber:
          order.receipt
            ? formatReceiptNumber(order.receipt.series, order.receipt.number, order.receipt.issuedAt)
            : null,
      };
    });

    return NextResponse.json({ success: true, data, meta: { page, pageSize, total } });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/orders — quick counter sale.
 *
 * Body: {
 *   items: [{ description, unitCents, quantity?, taxRateBps? }],
 *   customerId?, locationId?, note?,
 *   payment?: { method, amountCents, reference?, idempotencyKey? }
 * }
 *
 * The optional first payment is created in the same request (its own
 * transaction inside addPaymentToOrder); a partial first payment simply leaves
 * the order with a due balance.
 */
export async function POST(request: NextRequest) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'collect');
    if (denied) return denied;

    const body = await readJson(request);
    const items = validateOrderItems(body.items);
    if (!items.ok) throw new OrderError(items.error, 400);

    const owner = await prisma.user.findUnique({
      where: { id: actor!.userId },
      select: { currency: true },
    });

    const order = await createOrder(
      {
        userId: actor!.userId,
        currency: owner?.currency || 'EUR',
        items: body.items,
        customerId: body.customerId ?? null,
        locationId: body.locationId ?? null,
        note: body.note ?? null,
        actor: { id: actor!.userId, name: actor!.name },
      },
    );

    let paymentResult: Awaited<ReturnType<typeof addPaymentToOrder>> | null = null;
    if (body.payment) {
      paymentResult = await addPaymentToOrder(
        {
          userId: actor!.userId,
          orderId: order.id,
          method: body.payment.method,
          amountCents: body.payment.amountCents,
          reference: body.payment.reference ?? null,
          idempotencyKey: body.payment.idempotencyKey ?? null,
          actor: { id: actor!.userId, name: actor!.name },
        },
      );
    }

    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true, payments: true, receipt: true },
    });
    const balance = fresh
      ? orderBalanceCents(orderTotalCents(fresh.items), fresh.payments)
      : null;

    return NextResponse.json(
      {
        success: true,
        data: {
          order: fresh ?? order,
          balance,
          payment: paymentResult?.payment ?? null,
          idempotentReplay: paymentResult?.idempotentReplay ?? false,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
