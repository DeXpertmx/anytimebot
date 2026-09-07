import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode } from '@/lib/stripe-mode';
import { getTenantStripeAccountId } from '@/lib/stripe-connect';
import { buildServiceItems, totalPrice, compactServiceItems, type ServiceItem } from '@/lib/multi-service';

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
    const { eventTypeId, eventTypeIds, guestName, guestEmail, startTime, timezone, locationId = null } = body;

    if (!guestName || !guestEmail || !startTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Multi-service: several paid services combined into one Checkout session
    // with the total amount (sum of every paid service). The primary is the
    // first service; a compact serviceItems payload rides in the metadata so
    // the webhook can rebuild the booking (end time + service list).
    const serviceIds =
      Array.isArray(eventTypeIds) && eventTypeIds.length > 0
        ? eventTypeIds
        : eventTypeId
          ? [eventTypeId]
          : [];
    if (serviceIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    // Get event types with booking page and user info
    const eventTypes = await prisma.eventType.findMany({
      where: { id: { in: serviceIds } },
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

    if (eventTypes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Event type not found' },
        { status: 404 }
      );
    }

    const eventType = eventTypes[0];
    const isMultiService = eventTypes.length > 1;
    const paid = eventTypes.filter((et) => et.collectPayment && et.price > 0);
    if (paid.length === 0) {
      return NextResponse.json(
        { success: false, error: 'This event type does not require payment' },
        { status: 400 }
      );
    }
    const total = totalPrice(eventTypes);
    const currency = paid[0].currency;
    const serviceItems: ServiceItem[] = buildServiceItems(eventTypes);

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
    // Multi-service blocks are always one-time payments (a subscription cannot
    // combine several services), so recurrence only applies to single services.
    const isRecurring =
      !isMultiService &&
      (eventType.paymentInterval === 'MONTH' || eventType.paymentInterval === 'YEAR');
    const interval = eventType.paymentInterval === 'YEAR' ? 'year' : 'month';

    const sessionParams: any = {
      ...(!tenantAccountId && user.stripeCustomerId ? { customer: user.stripeCustomerId } : {}),
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: isMultiService ? serviceItems.map((s) => s.name).join(' + ') : eventType.name,
              description: `${isMultiService ? total : eventType.duration} minutes - ${eventType.bookingPage.title}`,
              metadata: {
                eventTypeId,
                bookingPageId: eventType.bookingPageId,
                userId: user.id,
              },
            },
            unit_amount: total,
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
        // Branch chosen by the guest on the public page (multi-sede events).
        locationId: locationId || '',
        // Combined services (multi-service bookings): compact payload the
        // webhook uses to rebuild the service list and end time.
        ...(isMultiService ? { serviceItems: compactServiceItems(serviceItems) } : {}),
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
