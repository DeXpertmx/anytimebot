import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { isManualPaymentMethod, paymentMethodLabel } from '@/lib/payment-methods';
// Finalizing (status → COMPLETED) is delegated to the booking PUT handler so
// the invoice, the AI summary, the guest emails/WhatsApp and the outgoing
// webhook all keep a single source of truth.
import { PUT as updateBooking } from '../route';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/[id]/payment
 *
 * Records money collected **in person** (cash, card terminal, transfer, Bizum):
 * marks the booking as PAID with the method used, the amount and the currency.
 * Nothing is sent to Stripe — this is the offline counterpart of the Stripe
 * webhook. With `complete: true` the appointment is also marked as finished,
 * which emits its invoice (and the thank-you email/WhatsApp).
 *
 * Body: { method: CASH|CARD_ONSITE|TRANSFER|BIZUM|OTHER, amountCents?, complete? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;
    const body = await request.json().catch(() => ({} as any));
    const { method, amountCents, complete } = body ?? {};

    if (!isManualPaymentMethod(method)) {
      return NextResponse.json(
        { success: false, error: 'Método de cobro no válido' },
        { status: 400 }
      );
    }

    const booking = await prisma.booking.findFirst({
      where: { id: params.id, eventType: { bookingPage: { userId } } },
      include: {
        eventType: {
          select: { name: true, price: true, currency: true, collectPayment: true },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Reserva no encontrada' },
        { status: 404 }
      );
    }

    // Online payments belong to Stripe: recording them by hand would desync the
    // Stripe dashboard. Those are corrected with the refund flow instead.
    if (booking.stripeSessionId || booking.stripePaymentIntent) {
      return NextResponse.json(
        {
          success: false,
          error: 'Esta reserva se cobró online con Stripe. Usa «Reembolsar» para devolver el importe.',
        },
        { status: 409 }
      );
    }

    // Amount: explicit value → already recorded one → the event type's price.
    let cents: number | null = null;
    if (amountCents !== undefined && amountCents !== null && amountCents !== '') {
      const parsed = Math.round(Number(amountCents));
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { success: false, error: 'Importe no válido' },
          { status: 400 }
        );
      }
      cents = parsed;
    } else if (booking.paymentAmount != null) {
      cents = booking.paymentAmount;
    } else if (booking.eventType.collectPayment && booking.eventType.price > 0) {
      cents = booking.eventType.price;
    }

    if (cents === null) {
      return NextResponse.json(
        { success: false, error: 'Indica el importe cobrado' },
        { status: 400 }
      );
    }

    // Currency: keep what was already recorded, else the event's, else the
    // tenant's operating currency (what the revenue report displays in).
    let currency = booking.paymentCurrency || booking.eventType.currency || null;
    if (!currency) {
      const owner = await prisma.user.findUnique({
        where: { id: userId },
        select: { currency: true },
      });
      currency = owner?.currency || 'EUR';
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'PAID',
        paymentMethod: method,
        paymentAmount: cents,
        paymentCurrency: currency.toLowerCase(),
        paidAt: new Date(),
      },
    });

    // Optionally close the appointment in the same action: the PUT handler
    // emits the invoice, the AI summary and the guest notifications.
    let completed = false;
    let finalizeWarning: string | null = null;
    const shouldComplete =
      complete === true && booking.status !== 'COMPLETED' && ['CONFIRMED', 'PENDING'].includes(booking.status);

    if (shouldComplete) {
      try {
        const finalizeRequest = new NextRequest(new URL(`/api/bookings/${booking.id}`, request.url), {
          method: 'PUT',
          headers: {
            'content-type': 'application/json',
            cookie: request.headers.get('cookie') ?? '',
          },
          body: JSON.stringify({ status: 'COMPLETED' }),
        });
        const finalizeResponse = await updateBooking(finalizeRequest, { params: { id: booking.id } });
        const finalizeJson = await finalizeResponse.json().catch(() => null);
        if (finalizeJson?.success) {
          completed = true;
        } else {
          finalizeWarning = finalizeJson?.error || 'No se pudo finalizar la cita';
        }
      } catch (finalizeError) {
        console.error('Failed to finalize booking after recording payment:', finalizeError);
        finalizeWarning = 'El cobro se registró, pero no se pudo finalizar la cita';
      }
    }

    const updated = await prisma.booking.findUnique({ where: { id: booking.id } });

    return NextResponse.json({
      success: true,
      data: {
        booking: updated,
        methodLabel: paymentMethodLabel(method),
        completed,
        finalizeWarning,
      },
    });
  } catch (error) {
    console.error('Error recording manual payment:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/bookings/[id]/payment
 *
 * Annuls a payment recorded in person (wrong amount, wrong booking...). Only
 * works when Stripe was never involved — online payments are refunded through
 * Stripe. Any invoice already issued for the booking is cancelled.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as any).id as string;

    const booking = await prisma.booking.findFirst({
      where: { id: params.id, eventType: { bookingPage: { userId } } },
      include: { invoice: { select: { id: true, status: true } } },
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Reserva no encontrada' },
        { status: 404 }
      );
    }

    if (booking.stripeSessionId || booking.stripePaymentIntent) {
      return NextResponse.json(
        {
          success: false,
          error: 'Este cobro se hizo con Stripe y no se puede anular aquí. Usa «Reembolsar».',
        },
        { status: 409 }
      );
    }

    if (booking.paymentStatus !== 'PAID') {
      return NextResponse.json(
        { success: false, error: 'La reserva no está marcada como cobrada' },
        { status: 400 }
      );
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: null,
        paymentMethod: null,
        paymentAmount: null,
        paymentCurrency: null,
        paidAt: null,
      },
    });

    if (booking.invoice && booking.invoice.status !== 'CANCELLED') {
      await prisma.invoice.update({
        where: { id: booking.invoice.id },
        data: { status: 'CANCELLED' },
      });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error annulling manual payment:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
