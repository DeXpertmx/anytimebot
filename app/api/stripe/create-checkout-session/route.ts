export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getStripe, getSubscriptionPeriodEnd } from '@/lib/stripe';
import { getStripeMode, getStripeKeys, getStripePriceId } from '@/lib/stripe-mode';
import { updateUserPlanQuotas, type PlanTier } from '@/lib/plans';
import { getResellerBySlug, getResellerPlanPrices, resolvePublicPriceCents, OFFICIAL_PRICE_CENTS } from '@/lib/resellers';

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
        resellerId: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        foundersBasicCheckoutSessionId: true,
        foundersBasicPaymentIntentId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Reseller pricing: an attributed customer pays the reseller's public
    // price (which is always >= wholesale). Falls back to the official price
    // when the reseller hasn't configured that plan.
    let resellerPublicCents: number | null = null;
    if (user.resellerId) {
      const reseller = await prisma.reseller.findUnique({
        where: { id: user.resellerId },
        select: { slug: true, isActive: true },
      });
      if (reseller?.isActive) {
        const planPrices = await getResellerPlanPrices(user.resellerId);
        const resolved = resolvePublicPriceCents(plan as 'BASIC' | 'PRO' | 'TEAM', planPrices);
        const official = OFFICIAL_PRICE_CENTS[plan as 'BASIC' | 'PRO' | 'TEAM'] ?? 0;
        if (resolved > 0 && resolved !== official) {
          resellerPublicCents = resolved;
        }
      }
    }

    const confirmed = body.confirmed === true;

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
              unit_amount: resellerPublicCents ?? 2900,
            },
            quantity: 1,
          },
        ],
        success_url: `${origin}/dashboard?payment=success&plan=BASIC&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?payment=cancelled`,
        metadata: {
          userId: user.id,
          plan: 'BASIC',
          ...(user.resellerId ? { resellerId: user.resellerId } : {}),
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { foundersBasicCheckoutSessionId: checkoutSession.id },
      });

      return NextResponse.json({ sessionId: checkoutSession.id, url: checkoutSession.url, publishableKey });
    }

    // Never trust a client-supplied Price ID. Resolve subscription prices only
    // from server-side configuration: the reseller's public price (dynamic
    // price_data) or the official price ID for the active mode.
    const subscriptionPriceId = plan === 'PRO'
      ? await getStripePriceId(mode, 'PRO')
      : await getStripePriceId(mode, 'TEAM');
    if (!subscriptionPriceId && !resellerPublicCents) {
      return NextResponse.json({ error: `Stripe price is not configured for ${plan} in ${mode} mode` }, { status: 503 });
    }

    // If the user already has an active subscription, switch its price on the
    // existing subscription instead of creating a new one. Stripe prorates the
    // price difference automatically, so the user only pays the difference.
    if (user.stripeSubscriptionId) {
      try {
        const existingSubscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const existingItemId = existingSubscription.items?.data?.[0]?.id;
        const currentPriceId = existingSubscription.items?.data?.[0]?.price?.id;
        const isActive = ['active', 'trialing', 'past_due'].includes(existingSubscription.status);

        if (isActive && existingItemId && currentPriceId && currentPriceId !== subscriptionPriceId) {
          // Never apply a plan change without explicit confirmation from the
          // user: it changes their recurring price, even when prorated.
          if (!confirmed) {
            const currentPrice = existingSubscription.items?.data?.[0]?.price?.unit_amount ?? null;
            const targetPrice = resellerPublicCents ?? (subscriptionPriceId ? (await stripe.prices.retrieve(subscriptionPriceId)).unit_amount ?? null : null);
            return NextResponse.json({
              requiresConfirmation: true,
              currentPlan: user.plan,
              targetPlan: plan,
              currentPrice: currentPrice ? currentPrice / 100 : null,
              targetPrice: targetPrice ? targetPrice / 100 : null,
            });
          }

          // Reseller customers switch to their reseller's public price via
          // inline price_data (no fixed Price ID exists for it); everyone else
          // switches to the official price ID.
          let resellerProductId = '';
          if (resellerPublicCents) {
            // Reuse the official product (so it shows the same product in the
            // customer portal); fall back to a dedicated product if needed.
            if (subscriptionPriceId) {
              const officialPrice = await stripe.prices.retrieve(subscriptionPriceId);
              resellerProductId = (officialPrice.product as string) || '';
            }
            if (!resellerProductId) {
              const product = await stripe.products.create({ name: `Anytimebot ${plan}` });
              resellerProductId = product.id;
            }
          }

          const updated = await stripe.subscriptions.update(user.stripeSubscriptionId, {
            items: resellerPublicCents
              ? [{
                  id: existingItemId,
                  price_data: {
                    currency: 'eur',
                    product: resellerProductId,
                    unit_amount: resellerPublicCents,
                    recurring: { interval: 'month' },
                  },
                }]
              : [{ id: existingItemId, price: subscriptionPriceId }],
            proration_behavior: 'create_prorations',
            proration_date: Math.floor(Date.now() / 1000),
            // Keep the plan metadata current so the webhook can resolve the
            // plan for reseller subscriptions (whose price ID is not official).
            metadata: {
              ...(existingSubscription.metadata || {}),
              plan,
            },
          });

          const periodEndSeconds = getSubscriptionPeriodEnd(updated);
          const updatedPriceId = updated.items?.data?.[0]?.price?.id ?? subscriptionPriceId ?? null;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan,
              subscriptionStatus: 'ACTIVE',
              ...(periodEndSeconds ? { subscriptionEndsAt: new Date(periodEndSeconds * 1000) } : {}),
            },
          });
          await updateUserPlanQuotas(user.id, plan);

          await prisma.subscription.upsert({
            where: { stripeSubscriptionId: updated.id },
            create: {
              userId: user.id,
              plan,
              status: 'ACTIVE',
              stripeSubscriptionId: updated.id,
              stripePriceId: updatedPriceId,
              ...(periodEndSeconds ? { stripeCurrentPeriodEnd: new Date(periodEndSeconds * 1000) } : {}),
            },
            update: {
              plan,
              status: 'ACTIVE',
              stripePriceId: updatedPriceId,
              ...(periodEndSeconds ? { stripeCurrentPeriodEnd: new Date(periodEndSeconds * 1000) } : {}),
            },
          });

          console.log(`✅ User ${user.id} switched subscription to ${plan} with proration`);
          return NextResponse.json({
            success: true,
            url: `${origin}/dashboard?payment=success&plan=${plan}`,
          });
        }
      } catch (error) {
        console.warn('Could not switch existing subscription, falling back to new checkout:', error);
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: resellerPublicCents
        ? [
            {
              price_data: {
                currency: 'eur',
                product_data: {
                  name: `Anytimebot ${plan}`,
                },
                unit_amount: resellerPublicCents,
                recurring: { interval: 'month' },
              },
              quantity: 1,
            },
          ]
        : [{ price: subscriptionPriceId, quantity: 1 }],
      success_url: `${origin}/dashboard?payment=success&plan=${plan}`,
      cancel_url: `${origin}/pricing?payment=cancelled`,
      metadata: {
        userId: user.id,
        plan,
        ...(user.resellerId ? { resellerId: user.resellerId } : {}),
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