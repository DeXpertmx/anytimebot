import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode } from '@/lib/stripe-mode';
import { notifyAdminBookingRefunded } from '@/lib/system-whatsapp';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/[id]/refund
 * Refunds a paid booking via Stripe (full refund) and marks the booking as
 * REFUNDED. Refunded bookings are automatically subtracted from the net
 * revenue report (/api/revenue).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id: params.id,
        eventType: {
          bookingPage: {
            userId: (session.user as any).id,
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 },
      );
    }

    if (booking.paymentStatus !== 'PAID') {
      return NextResponse.json(
        { success: false, error: 'Booking is not paid or already refunded' },
        { status: 400 },
      );
    }

    if (!booking.stripeSessionId && !booking.stripePaymentIntent) {
      return NextResponse.json(
        { success: false, error: 'Booking has no associated payment' },
        { status: 400 },
      );
    }

    const mode = await getStripeMode();
    const stripe = await getStripe(mode);

    // Resolve the PaymentIntent: prefer the stored ID, otherwise look it up
    // from the Checkout session.
    let paymentIntentId = booking.stripePaymentIntent;
    if (!paymentIntentId && booking.stripeSessionId) {
      const checkout = await stripe.checkout.sessions.retrieve(
        booking.stripeSessionId,
        { expand: ['payment_intent'] },
      );
      paymentIntentId =
        typeof checkout.payment_intent === 'string'
          ? checkout.payment_intent
          : (checkout.payment_intent?.id ?? null);
    }

    if (!paymentIntentId) {
      return NextResponse.json(
        { success: false, error: 'Could not resolve the payment to refund' },
        { status: 400 },
      );
    }

    // Destination charges are created on the platform account; Stripe
    // automatically reverses the transfer to the tenant when refunded.
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
    });

    // Mark the booking as refunded
    const updatedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: 'REFUNDED',
        stripePaymentIntent: paymentIntentId,
      },
    });

    // Notify the Anytimebot admin via the system WhatsApp number.
    try {
      const eventType = await prisma.eventType.findUnique({
        where: { id: booking.eventTypeId },
        select: { name: true },
      });
      await notifyAdminBookingRefunded({
        guestName: booking.guestName,
        guestEmail: booking.guestEmail,
        eventTypeName: eventType?.name || 'Reserva',
        startTime: booking.startTime,
        timezone: booking.timezone,
        amount: refund.amount,
        currency: refund.currency,
      });
    } catch (notifyError) {
      // Best-effort; never fail the refund because the notification failed.
      console.error('Failed to notify admin of booking refund:', notifyError);
    }

    return NextResponse.json({
      success: true,
      data: updatedBooking,
      refund: { id: refund.id, amount: refund.amount, currency: refund.currency },
    });
  } catch (error: any) {
    console.error('Error refunding booking:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}