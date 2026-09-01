export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getStripeMode } from '@/lib/stripe-mode';

/**
 * Daily cron: reconcile memberships whose billing period ended without a
 * successful renewal.
 *
 * - ACTIVE/TRIALING memberships with `currentPeriodEnd` in the past are marked
 *   PAST_DUE (the renewal invoice was not paid; Stripe keeps retrying).
 * - PAST_DUE memberships still unpaid 30+ days after the period end are
 *   cancelled on Stripe (best-effort) and marked CANCELLED.
 *
 * Vercel Cron authenticates this route with CRON_SECRET; manual calls without
 * the secret are rejected.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const result = {
    markedPastDue: 0,
    cancelled: 0,
    alreadyHandled: 0,
  };

  try {
    const now = new Date();
    const cutOff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1) Period ended without renewal -> mark as overdue (PAST_DUE).
    const expired = await prisma.memberSubscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIALING'] },
        currentPeriodEnd: { lt: now },
      },
      select: { id: true },
    });

    if (expired.length > 0) {
      await prisma.memberSubscription.updateMany({
        where: { id: { in: expired.map((m) => m.id) } },
        data: { status: 'PAST_DUE' },
      });
      result.markedPastDue = expired.length;
    }

    // 2) Long-overdue memberships (30+ days) -> cancel on Stripe + CANCELLED.
    const overdue = await prisma.memberSubscription.findMany({
      where: {
        status: 'PAST_DUE',
        currentPeriodEnd: { lt: cutOff30 },
      },
      select: { id: true, stripeSubscriptionId: true, stripeAccountId: true },
    });

    if (overdue.length > 0) {
      let stripe: Awaited<ReturnType<typeof getStripe>> | null = null;
      for (const membership of overdue) {
        try {
          if (!stripe) {
            const mode = await getStripeMode();
            stripe = await getStripe(mode);
          }
          const opts = membership.stripeAccountId
            ? { stripeAccount: membership.stripeAccountId }
            : {};
          await stripe.subscriptions.cancel(
            membership.stripeSubscriptionId,
            undefined,
            opts as any,
          );
          await prisma.memberSubscription.update({
            where: { id: membership.id },
            data: { status: 'CANCELLED' },
          });
          result.cancelled += 1;
        } catch (error) {
          console.error(
            `Error cancelling overdue membership ${membership.id}:`,
            error,
          );
        }
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error expiring memberships:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}