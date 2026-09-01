import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode } from '@/lib/stripe-mode';
import { getTenantStripeAccountId } from '@/lib/stripe-connect';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/create-payment
 * Creates a Stripe Checkout session for a booking that requires payment.
 *
 * When the tenant has connected their own Stripe account (Stripe Connect), the
 * Checkout session is created ON that account, so the money goes directly to
 * the tenant's bank (no platform fee). Otherwise it falls back to the platform
 * account (legacy behavior).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { eventTypeId, guestName, guestEmail, startTime, timezone } = body;

    if (!eventTypeId || !guestName || !guestEmail || !startTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get event type with booking page and user info
    const eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: {
        bookingPage: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                stripeCustomerId: true,
                country: true,
                currency: true,
              },
            },
          },
        },
      },
    });

    if (!eventType) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    if (!eventType.collectPayment || eventType.price === 0) {
      return NextResponse.json(
        { success: false, error: 'This event type does not require payment' },
        { status: 400 }
      );
    }

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'https://anytimebot.app';
    const user = eventType.bookingPage.user;

    // Stripe Connect: when the tenant connected their own account, the payment
    // is created as a destination charge with on_behalf_of, so the guest sees
    // the tenant's business on the receipt and Stripe sends the full amount
    // (minus only Stripe's own fees, no platform fee) to the tenant's balance.
    const tenantAccountId = await getTenantStripeAccountId(user.id);

    // Create checkout session in the active mode (test vs live)
    const mode = await getStripeMode();
    const client = await getStripe(mode);

    // Recurring membership (monthly/yearly): use a subscription checkout.
    const isRecurring = eventType.paymentInterval === 'MONTH' || eventType.paymentInterval === 'YEAR';
    const interval = eventType.paymentInterval === 'YEAR' ? 'year' : 'month';

    const sessionParams: any = {
      ...(!tenantAccountId && user.stripeCustomerId ? { customer: user.stripeCustomerId } : {}),
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: eventType.currency,
            product_data: {
              name: eventType.name,
              description: `${eventType.duration} minutes - ${eventType.bookingPage.title}`,
              metadata: {
                eventTypeId,
                bookingPageId: eventType.bookingPageId,
                userId: user.id,
              },
            },
            unit_amount: eventType.price,
            ...(isRecurring ? { recurring: { interval, interval_count: 1 } } : {}),
          },
          quantity: 1,
        },
      ],
      ...(isRecurring
        ? {
            mode: 'subscription',
            subscription_data: {
              // Recurring destination: money goes to the tenant's Stripe balance
              // each cycle; receipt is on behalf of the tenant's business.
              ...(tenantAccountId
                ? {
                    on_behalf_of: tenantAccountId,
                    transfer_data: { destination: tenantAccountId },
                  }
                : {}),
              metadata: {
                eventTypeId,
                bookingPageId: eventType.bookingPageId,
                userId: user.id,
                guestName,
                guestEmail,
                startTime,
                timezone: timezone || 'UTC',
                tenantAccountId: tenantAccountId || '',
                membershipEvent: 'true',
              },
            },
          }
        : {
            mode: 'payment',
            payment_intent_data: tenantAccountId
              ? {
                  // Money goes to the tenant's Stripe balance and from there to
                  // their bank; receipt issued on behalf of the tenant's business.
                  on_behalf_of: tenantAccountId,
                  transfer_data: { destination: tenantAccountId },
                }
              : undefined,
          }),
      success_url: `${origin}/booking/${eventTypeId}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/booking/${eventTypeId}?cancelled=true`,
      customer_email: guestEmail,
      metadata: {
        eventTypeId,
        bookingPageId: eventType.bookingPageId,
        userId: user.id,
        guestName,
        guestEmail,
        startTime,
        timezone: timezone || 'UTC',
        tenantAccountId: tenantAccountId || '',
        ...(isRecurring ? { membershipEvent: 'true' } : {}),
      },
    };

    const session = await client.checkout.sessions.create(sessionParams);

    return NextResponse.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    console.error('Error creating payment session:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create payment session' },
      { status: 500 }
    );
  }
}
