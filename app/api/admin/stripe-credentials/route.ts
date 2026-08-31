export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, logAdminAction } from '@/lib/admin';
import {
  saveStripeCredentials,
  clearStripeCredentials,
  type StripeMode,
  type StripeModeCredentials,
} from '@/lib/stripe-mode';

const CREDENTIAL_FIELDS: Array<keyof StripeModeCredentials> = [
  'secretKey',
  'publishableKey',
  'webhookSecret',
  'pricePro',
  'priceTeam',
];

/**
 * POST /api/admin/stripe-credentials
 * Body: { mode: 'live' | 'test', clear?: true } or
 *       { mode: 'live' | 'test', credentials: { secretKey?, publishableKey?, webhookSecret?, pricePro?, priceTeam? } }
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const raw: unknown = body.mode;
    if (raw !== 'live' && raw !== 'test') {
      return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
    }
    const mode = raw as StripeMode;

    if (body.clear === true) {
      await clearStripeCredentials(mode);
      await logAdminAction(admin.id, 'CLEAR_STRIPE_CREDENTIALS', null, { mode }, request);
      return NextResponse.json({ ok: true });
    }

    const incoming = body.credentials ?? {};
    const credentials: Partial<StripeModeCredentials> = {};
    for (const field of CREDENTIAL_FIELDS) {
      if (typeof incoming[field] === 'string') {
        credentials[field] = incoming[field];
      }
    }
    if (Object.keys(credentials).length === 0) {
      return NextResponse.json({ error: 'No credentials provided' }, { status: 400 });
    }

    await saveStripeCredentials(mode, credentials);
    await logAdminAction(admin.id, 'SET_STRIPE_CREDENTIALS', null, { mode }, request);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to save credentials' },
      { status: 500 },
    );
  }
}