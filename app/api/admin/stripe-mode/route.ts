export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminUser, logAdminAction } from '@/lib/admin';
import { getStripeMode, setStripeMode, isModeConfigured, getStripeKeys, getStripePriceId, type StripeMode } from '@/lib/stripe-mode';

export type StripeModeStatus = {
  mode: StripeMode;
  modes: Record<
    StripeMode,
    {
      configured: boolean;
      secretKey: boolean;
      publishableKey: boolean;
      webhookSecret: boolean;
      pricePro: boolean;
      priceTeam: boolean;
    }
  >;
};

export async function GET() {
  try {
    await requireAdmin();
    const mode = await getStripeMode();
    return NextResponse.json(statusFor(mode));
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const raw: unknown = body.mode;
    if (raw !== 'test' && raw !== 'live') {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }
    const mode: StripeMode = raw;

    const previous = await getStripeMode();
    await setStripeMode(mode);

    await logAdminAction(
      admin.id,
      'SET_STRIPE_MODE',
      null,
      { previous, mode },
      request,
    );

    return NextResponse.json(statusFor(mode));
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update mode' },
      { status: 500 },
    );
  }
}

function statusFor(mode: StripeMode): StripeModeStatus {
  const check = (m: StripeMode) => {
    const keys = getStripeKeys(m);
    return {
      configured: isModeConfigured(m),
      secretKey: Boolean(keys.secretKey),
      publishableKey: Boolean(keys.publishableKey),
      webhookSecret: Boolean(keys.webhookSecret),
      pricePro: Boolean(getStripePriceId(m, 'PRO')),
      priceTeam: Boolean(getStripePriceId(m, 'TEAM')),
    };
  };
  return {
    mode,
    modes: {
      live: check('live'),
      test: check('test'),
    },
  };
}