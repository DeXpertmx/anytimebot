export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, logAdminAction } from '@/lib/admin';
import {
  saveEmailCredentials,
  clearEmailCredentials,
  isEmailConfigured,
  hasStoredEmailCredentials,
} from '@/lib/email-config';

/**
 * GET /api/admin/email-credentials
 * Returns whether email delivery is configured and whether the key was saved
 * from the admin panel (never returns the key itself).
 */
export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const [configured, stored] = await Promise.all([isEmailConfigured(), hasStoredEmailCredentials()]);
    return NextResponse.json({
      configured,
      stored,
      source: stored ? 'database' : 'env',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to read email configuration' }, { status: 500 });
  }
}

/**
 * POST /api/admin/email-credentials
 * Body: { apiKey: 're_...' } to save, or { clear: true } to remove the saved key.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    if (body.clear === true) {
      await clearEmailCredentials();
      await logAdminAction(admin.id, 'CLEAR_EMAIL_CREDENTIALS', null, {}, request);
      return NextResponse.json({ ok: true });
    }

    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400 });
    }
    if (apiKey === 're_placeholder') {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 400 });
    }

    await saveEmailCredentials({ apiKey });
    await logAdminAction(admin.id, 'SET_EMAIL_CREDENTIALS', null, {}, request);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save credentials' }, { status: 500 });
  }
}
