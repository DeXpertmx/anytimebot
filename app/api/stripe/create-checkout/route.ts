
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { stripe, PLANS } from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !(session.user as any)?.email || !(session.user as any)?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const origin = request.headers.get('origin') || 'https://meetmind.abacusai.app';

    // Create or get Stripe customer
    let customerId = (session.user as any).stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: (session.user as any).email,
        metadata: {
          userId: (session.user as any).id,
        },
      });
      customerId = customer.id;

      // Update user with customer ID
      const { prisma: db } = await import('@/lib/db');
      await db.user.update({
        where: { id: (session.user as any).id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Create checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'ANYTIMEBOT Premium',
              description: 'Unlimited bookings and advanced AI features',
            },
            unit_amount: PLANS.PREMIUM.price * 100, // Convert to cents
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${origin}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: {
        userId: (session.user as any).id,
      },
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
