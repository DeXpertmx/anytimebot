import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getActor, requireCapability, errorResponse, readJson } from '@/lib/api-payments';
import { ensureBookingOrder, orderBalanceCents, orderTotalCents } from '@/lib/orders';
import { addPaymentToOrder, annulPayment } from '@/lib/payments';
import { isManualPaymentMethod } from '@/lib/payment-methods';

export const dynamic = 'force-dynamic';

/**
 * GET /api/bookings/[id]/payments — the booking's order + payment history
 * (multi-payment view for the calendar modal).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'collect');
    if (denied) return denied;

    const booking = await prisma.booking.findFirst({
      where: { id: params.id, eventType: { bookingPage: { userId: actor!.userId } } },
      include: {
        eventType: { select: { name: true, price: true, currency: true, collectPayment: true } },
      },
    });
    if (!booking) {
      return NextResponse.json({ success: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    const order = await prisma.order.findFirst({
      where: { bookingId: booking.id, userId: actor!.userId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: 'asc' } },
        receipt: { select: { series: true, number: true, issuedAt: true } },
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        booking: {
          id: booking.id,
          paymentStatus: booking.paymentStatus,
          paymentMethod: booking.paymentMethod,
          paymentAmount: booking.paymentAmount,
          paymentCurrency: booking.paymentCurrency,
        },
        eventType: booking.eventType,
        order: order
          ? {
              ...order,
              balance: orderBalanceCents(orderTotalCents(order.items), order.payments),
              receiptNumber: order.receipt
                ? formatReceiptNumberSafe(order.receipt)
                : null,
            }
          : null,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/bookings/[id]/payments — record money collected in person for an
 * appointment (cash, card terminal, transfer, Bizum, other).
 *
 * Body: { method, amountCents, reference?, idempotencyKey?, complete? }
 *
 * The booking gets (or reuses) its order — which also absorbs a historical
 * Stripe payment as a CARD_ONLINE mirror row — and the new payment is added to
 * it. Partial and mixed-method payments simply accumulate. Stripe is never
 * called: manual money and CARD_ONLINE mirrors are kept strictly apart.
 *
 * Legacy sync: when the order's balance reaches PAID, the booking's flat
 * payment columns are updated so the rest of the app (revenue report, invoice
 * emission, calendar badges) stays coherent. With `complete: true` the
 * appointment is also finalized (invoice + notifications) through the same PUT
 * handler the legacy route uses.
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
    if (!isManualPaymentMethod(body.method)) {
      return NextResponse.json(
        { success: false, error: 'Método de cobro no válido' },
        { status: 400 }
      );
    }

    const booking = await prisma.booking.findFirst({
      where: { id: params.id, eventType: { bookingPage: { userId: actor!.userId } } },
      include: {
        eventType: {
          select: {
            name: true,
            price: true,
            currency: true,
            duration: true,
            bookingPage: { select: { userId: true, user: { select: { currency: true } } } },
          },
        },
      },
    });
    if (!booking) {
      return NextResponse.json({ success: false, error: 'Reserva no encontrada' }, { status: 404 });
    }
    if (booking.stripeSessionId || booking.stripePaymentIntent) {
      // Stripe bookings keep their own flow (refund in Stripe); a manual
      // top-up is still allowed on top of an online payment.
    }

    const order = await ensureBookingOrder(
      {
        id: booking.id,
        guestName: booking.guestName,
        startTime: booking.startTime,
        paymentStatus: booking.paymentStatus,
        paymentMethod: booking.paymentMethod,
        paymentAmount: booking.paymentAmount,
        paymentCurrency: booking.paymentCurrency,
        stripePaymentIntent: booking.stripePaymentIntent,
        serviceItems: booking.serviceItems,
        eventTypeId: booking.eventTypeId,
        eventType: {
          name: booking.eventType.name,
          price: booking.eventType.price,
          currency: booking.eventType.currency,
          duration: booking.eventType.duration,
          bookingPage: {
            userId: actor!.userId,
            user: { currency: booking.eventType.bookingPage.user.currency },
          },
        },
      },
      { id: actor!.userId, name: actor!.name },
    );

    const { payment, idempotentReplay } = await addPaymentToOrder(
      {
        userId: actor!.userId,
        orderId: order.id,
        method: body.method,
        amountCents: body.amountCents,
        reference: body.reference ?? null,
        idempotencyKey: body.idempotencyKey ?? null,
        actor: { id: actor!.userId, name: actor!.name },
      },
    );

    const fresh = await prisma.order.findUnique({
      where: { id: order.id },
      include: { items: true, payments: true },
    });
    const balance = fresh ? orderBalanceCents(orderTotalCents(fresh.items), fresh.payments) : null;

    // Legacy-column sync: the flat booking columns mirror the order balance so
    // revenue/invoices keep working. PAID only when fully collected; amount =
    // net money actually kept (gross minus refunds).
    let completed = false;
    let finalizeWarning: string | null = null;
    if (balance && balance.state === 'PAID') {
      const lastPayment = fresh!.payments[fresh!.payments.length - 1];
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          paymentStatus: 'PAID',
          paymentMethod: (lastPayment.method as any) ?? body.method,
          paymentAmount: balance.net,
          paymentCurrency: fresh!.currency,
          paidAt: new Date(),
        },
      });
    }

    // Optional finalize: same delegation as the legacy /payment route so the
    // invoice, AI summary and guest notifications keep a single source.
    const shouldComplete =
      body.complete === true &&
      booking.status !== 'COMPLETED' &&
      ['CONFIRMED', 'PENDING'].includes(booking.status);
    if (shouldComplete && balance && balance.state === 'PAID') {
      try {
        const { PUT: updateBooking } = await import('../route');
        const finalizeRequest = new NextRequest(
          new URL(`/api/bookings/${booking.id}`, request.url),
          {
            method: 'PUT',
            headers: {
              'content-type': 'application/json',
              cookie: request.headers.get('cookie') ?? '',
            },
            body: JSON.stringify({ status: 'COMPLETED' }),
          }
        );
        const finalizeResponse = await updateBooking(finalizeRequest, { params: { id: booking.id } });
        const finalizeJson = await finalizeResponse.json().catch(() => null);
        if (finalizeJson?.success) {
          completed = true;
        } else {
          finalizeWarning = finalizeJson?.error || 'No se pudo finalizar la cita';
        }
      } catch (finalizeError) {
        console.error('Failed to finalize booking after payment:', finalizeError);
        finalizeWarning = 'El cobro se registró, pero no se pudo finalizar la cita';
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        order: fresh,
        balance,
        payment,
        idempotentReplay,
        completed,
        finalizeWarning,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/bookings/[id]/payments — annul every manual payment of the
 * booking's order (wrong collection recorded by mistake). Stripe-backed rows
 * are never touched here: those are refunded through Stripe. Legacy flat
 * columns are cleared so the calendar shows the booking as unpaid again.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const actor = await getActor();
    const denied = requireCapability(actor, 'annul');
    if (denied) return denied;

    const booking = await prisma.booking.findFirst({
      where: { id: params.id, eventType: { bookingPage: { userId: actor!.userId } } },
    });
    if (!booking) {
      return NextResponse.json({ success: false, error: 'Reserva no encontrada' }, { status: 404 });
    }

    const order = await prisma.order.findFirst({
      where: { bookingId: booking.id, userId: actor!.userId },
      include: { payments: true },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'La reserva no tiene cobros registrados' }, { status: 404 });
    }

    const manualPayments = order.payments.filter(
      (p: any) => p.status === 'COMPLETED' && isManualPaymentMethod(p.method)
    );
    if (manualPayments.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Este cobro se hizo con Stripe y se reembolsa desde Stripe' },
        { status: 409 }
      );
    }

    let annulled = 0;
    for (const payment of manualPayments) {
      await annulPayment(
        payment.id,
        actor!.userId,
        'Cobro anulado desde la ficha de la cita',
        { id: actor!.userId, name: actor!.name },
      );
      annulled += 1;
    }

    // Legacy columns back to unpaid so the calendar UI stays coherent.
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: null,
        paymentMethod: null,
        paymentAmount: null,
        paymentCurrency: null,
        paidAt: null,
      },
    });

    return NextResponse.json({ success: true, data: { annulled } });
  } catch (error) {
    return errorResponse(error);
  }
}

function formatReceiptNumberSafe(receipt: { series: string; number: number; issuedAt: Date }): string {
  const year = receipt.issuedAt.getFullYear();
  return `${receipt.series}-${year}-${String(receipt.number).padStart(6, '0')}`;
}
