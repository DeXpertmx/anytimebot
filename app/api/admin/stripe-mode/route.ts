export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getAdminUser, logAdminAction } from '@/lib/admin';
import {
  getStripeMode,
  setStripeMode,
  isModeConfigured,
  getStripeKeys,
  getStripePriceId,
  hasStoredCredentials,
  type StripeMode,
} from '@/lib/stripe-mode';

const MODES: StripeMode[] = ['live', 'test'];

export type StripeModeStatus = {
  mode: StripeMode;
  modes: Record<
    StripeMode,
    {
      configured: boolean;
      stored: boolean;
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
    return NextResponse.json(await statusFor(mode));
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

    return NextResponse.json(await statusFor(mode));
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update mode' },
      { status: 500 },
    );
  }
}

async function statusFor(mode: StripeMode): Promise<StripeModeStatus> {
  const check = async (m: StripeMode) => {
    const keys = await getStripeKeys(m);
    return {
      configured: await isModeConfigured(m),
      stored: await hasStoredCredentials(m),
      secretKey: Boolean(keys.secretKey),
      publishableKey: Boolean(keys.publishableKey),
      webhookSecret: Boolean(keys.webhookSecret),
      pricePro: Boolean(await getStripePriceId(m, 'PRO')),
      priceTeam: Boolean(await getStripePriceId(m, 'TEAM')),
    };
  };

  const modes = {} as StripeModeStatus['modes'];
  for (const m of MODES) {
    modes[m] = await check(m);
  }

  return { mode, modes };
}