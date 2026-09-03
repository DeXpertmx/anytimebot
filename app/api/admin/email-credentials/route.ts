export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminUser, logAdminAction } from '@/lib/admin';
import {
  saveEmailCredentials,
  clearEmailCredentials,
  isEmailConfigured,
  hasStoredEmailCredentials,
  resolveEmailProvider,
} from '@/lib/email-config';
import { sendMail } from '@/lib/mailer';

/**
 * GET /api/admin/email-credentials
 * Returns whether email delivery is configured, which provider is active and
 * whether the credentials were saved from the admin panel (never returns the
 * credentials themselves).
 */
export async function GET() {
  try {
    const admin = await getAdminUser();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const [configured, stored, provider] = await Promise.all([
      isEmailConfigured(),
      hasStoredEmailCredentials(),
      resolveEmailProvider(),
    ]);
    return NextResponse.json({
      configured,
      stored,
      provider,
      source: stored ? 'database' : 'env',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to read email configuration' }, { status: 500 });
  }
}

/**
 * POST /api/admin/email-credentials
 * Body options:
 *   { apiKey: 're_...' }                       → save Resend API key
 *   { provider: 'smtp'|'auto'|'resend', smtpHost, smtpPort, smtpSecure,
 *     smtpUser, smtpPass, smtpFromName, smtpFromEmail } → save SMTP config
 *   { clear: true }                            → remove the saved credentials
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

    // Send a test email through the active provider to the admin's own address.
    if (body.test === true) {
      if (!admin.email) {
        return NextResponse.json({ error: 'Admin user has no email' }, { status: 400 });
      }
      const result = await sendMail({
        to: admin.email,
        subject: '🧪 Anytimebot test email',
        html: '<div style="font-family: Arial, sans-serif; padding: 24px;"><h2>✅ Test email OK</h2><p>This email was sent from the Anytimebot admin panel through the active email provider.</p></div>',
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error || 'Email send failed' }, { status: 500 });
      }
      await logAdminAction(admin.id, 'TEST_EMAIL', null, { provider: result.provider, id: result.id }, request);
      return NextResponse.json({ ok: true, provider: result.provider, id: result.id });
    }

    // Resend API key (backward compatible with the previous admin panel)
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      const apiKey = body.apiKey.trim();
      if (apiKey === 're_placeholder') {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 400 });
      }
      await saveEmailCredentials({ apiKey });
      await logAdminAction(admin.id, 'SET_EMAIL_CREDENTIALS', null, {}, request);
      return NextResponse.json({ ok: true });
    }

    // SMTP configuration
    const smtpHost = typeof body.smtpHost === 'string' ? body.smtpHost.trim() : '';
    if (!smtpHost) {
      return NextResponse.json({ error: 'SMTP host required' }, { status: 400 });
    }

    const provider = ['smtp', 'auto', 'resend'].includes(body.provider) ? body.provider : 'auto';

    await saveEmailCredentials({
      provider,
      smtpHost,
      smtpPort: typeof body.smtpPort === 'string' ? body.smtpPort.trim() : '',
      smtpSecure: body.smtpSecure === true || body.smtpSecure === 'true' ? 'true' : 'false',
      smtpUser: typeof body.smtpUser === 'string' ? body.smtpUser.trim() : '',
      smtpPass: typeof body.smtpPass === 'string' ? body.smtpPass.trim() : '',
      smtpFromName: typeof body.smtpFromName === 'string' ? body.smtpFromName.trim() : '',
      smtpFromEmail: typeof body.smtpFromEmail === 'string' ? body.smtpFromEmail.trim() : '',
    });
    await logAdminAction(admin.id, 'SET_EMAIL_SMTP', null, {}, request);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to save credentials' }, { status: 500 });
  }
}