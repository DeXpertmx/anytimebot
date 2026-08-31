export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode, getStripeKeys, getStripePriceId } from '@/lib/stripe-mode';
import type { PlanTier } from '@/lib/plans';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const requestedPlan = typeof body.plan === 'string' ? body.plan.toUpperCase() : '';
    const priceId = typeof body.priceId === 'string' ? body.priceId : '';
    const plan = (requestedPlan || planFromPriceId(priceId)) as PlanTier;

    if (!['BASIC', 'PRO', 'TEAM'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    // Resolve which Stripe mode is active (test vs live) and use its keys,
    // customer space and price IDs.
    const mode = await getStripeMode();
    const stripe = await getStripe(mode);
    const publishableKey = (await getStripeKeys(mode)).publishableKey;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        stripeCustomerId: true,
        foundersBasicCheckoutSessionId: true,
        foundersBasicPaymentIntentId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (plan === 'BASIC' && user.plan === 'BASIC') {
      return NextResponse.json({ error: 'Founders Basic is already active' }, { status: 409 });
    }
    if (plan === 'BASIC' && user.plan !== 'FREE') {
      return NextResponse.json({ error: 'Founders Basic is only available before upgrading to a subscription plan' }, { status: 409 });
    }

    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'https://anytimebot.app';

    if (plan === 'BASIC') {
      // Reuse an open session so repeated clicks cannot create multiple charges
      // before Stripe delivers the webhook for the first payment.
      if (user.foundersBasicCheckoutSessionId && !user.foundersBasicPaymentIntentId) {
        try {
          const existingSession = await stripe.checkout.sessions.retrieve(user.foundersBasicCheckoutSessionId);
          if (existingSession.status === 'open' && existingSession.url) {
            return NextResponse.json({
              sessionId: existingSession.id,
              url: existingSession.url,
              publishableKey,
            });
          }
        } catch (error) {
          console.warn('Could not reuse existing Founders Basic checkout session:', error);
        }
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Anytimebot Básico de fundadores',
                description: 'Acceso de pago único a las funciones esenciales de reservas',
              },
              unit_amount: 2900,
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/dashboard?payment=success&plan=BASIC&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?payment=cancelled`,
        metadata: {
          userId: user.id,
          plan: 'BASIC',
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { foundersBasicCheckoutSessionId: checkoutSession.id },
      });

      return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url, publishableKey });
    }

    // Never trust a client-supplied Price ID. Resolve subscription prices only
    // from server-side environment variables for the active mode.
    const subscriptionPriceId = plan === 'PRO'
      ? await getStripePriceId(mode, 'PRO')
      : await getStripePriceId(mode, 'TEAM');
    if (!subscriptionPriceId) {
      return NextResponse.json({ error: `Stripe price is not configured for ${plan} in ${mode} mode` }, { status: 503 });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: subscriptionPriceId, quantity: 1 }],
      success_url: `${origin}/dashboard?payment=success&plan=${plan}`,
      cancel_url: `${origin}/pricing?payment=cancelled`,
      metadata: {
        userId: user.id,
        plan,
      },
    });

    return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url, publishableKey });
  } catch (error: any) {
    console.error('Stripe checkout error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

function planFromPriceId(priceId: string): PlanTier | '' {
  if (priceId && priceId === process.env.STRIPE_PRICE_TEAM) return 'TEAM';
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO) return 'PRO';
  return '';
}