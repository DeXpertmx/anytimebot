import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor, requireCapability, errorResponse, readJson } from '@/lib/api-payments';
import { annulPayment, refundPayment } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/**
 * GET /api/payments/[id] — single payment with its order (receipt view).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'reports');
    if (denied) return denied;

    const payment = await prisma.payment.findFirst({
      where: { id: params.id, userId: actor!.userId },
      include: {
        order: {
          include: {
            items: true,
            receipt: { select: { series: true, number: true, issuedAt: true } },
          },
        },
      },
    });
    if (!payment) {
      return NextResponse.json({ success: false, error: 'Pago no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: payment });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/payments/[id] — body { action: 'annul' | 'refund', reason,
 * amountCents? }.
 *
 *  - annul: wrong collection; the row stays (status ANNULLED + reason + actor).
 *  - refund: money handed back (partial allowed, up to the non-refunded part).
 *
 * There is no DELETE on purpose: payments are never removed (Fase 0 rule).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    if (!actor) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await readJson(request);
    const reason = String(body.reason ?? '');
    const actionBody = { id: actor.userId, name: actor.name };

    if (body.action === 'annul') {
      const denied = requireCapability(actor, 'annul');
      if (denied) return denied;
      const updated = await annulPayment(params.id, actor.userId, reason, actionBody);
      return NextResponse.json({ success: true, data: updated });
    }

    if (body.action === 'refund') {
      const denied = requireCapability(actor, 'refund');
      if (denied) return denied;
      const updated = await refundPayment(
        {
          paymentId: params.id,
          userId: actor.userId,
          amountCents: body.amountCents ?? undefined,
          reason,
          actor: actionBody,
        },
      );
      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json(
      { success: false, error: "action debe ser 'annul' o 'refund'" },
      { status: 400 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
