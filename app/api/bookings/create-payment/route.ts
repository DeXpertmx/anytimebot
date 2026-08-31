import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode } from '@/lib/stripe-mode';

export const dynamic = 'force-dynamic';

/**
 * POST /api/bookings/create-payment
 * Creates a Stripe Checkout session for a booking that requires payment
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

    // Create or get Stripe customer for the guest
    let customerId: string | undefined;

    // Check if user has Stripe connected
    if (!user.stripeCustomerId) {
      // User doesn't have Stripe connected, use destination charges
      // The payment will go to the platform and we'll need to transfer
      console.log('User does not have Stripe customer ID, using platform charges');
    }

    // Create checkout session in the active mode (test vs live)
    const mode = await getStripeMode();
    const session = await (await getStripe(mode)).checkout.sessions.create({
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : {}),
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
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
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
      },
    });

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
