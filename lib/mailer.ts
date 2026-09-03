// Unified email sender.
//
// Routes every outbound email through the provider resolved from
// lib/email-config: SMTP when configured (preferred), otherwise the Resend API.

import nodemailer from 'nodemailer';
import { getSmtpConfig, getResendApiKey, resolveEmailProvider } from '@/lib/email-config';

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

export interface MailResult {
  ok: boolean;
  /** Provider used for the attempt: 'smtp' | 'resend' (or null when no provider). */
  provider: 'smtp' | 'resend' | null;
  /** Message id returned by the provider, when available (for traceability). */
  id?: string;
  error?: string;
}

/**
 * Sends an email using the active provider. Returns { ok: true, id } on
 * success so callers can log the provider message id for traceability.
 */
export async function sendMail({ to, subject, html }: MailOptions): Promise<MailResult> {
  const provider = await resolveEmailProvider();

  if (provider === 'smtp') {
    const smtp = await getSmtpConfig();
    if (!smtp?.host) {
      console.error('SMTP selected but host is not configured');
      return { ok: false, provider: 'smtp' };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass || '' } : undefined,
      });
      const info = await transporter.sendMail({
        from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
        to,
        subject,
        html,
      });
      console.log(`[email] smtp sent id=${info.messageId} to=${to} subject="${subject}"`);
      return { ok: true, provider: 'smtp', id: info.messageId };
    } catch (error) {
      console.error('SMTP send failed:', error);
      return { ok: false, provider: 'smtp', error: error instanceof Error ? error.message : String(error) };
    }
  }

  // Resend fallback
  try {
    const apiKey = await getResendApiKey();
    if (!apiKey || apiKey === 're_placeholder') {
      console.error('Resend API key not configured');
      return { ok: false, provider: 'resend' };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: 'ANYTIMEBOT <noreply@anytimebot.app>',
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Email sending failed:', error);
      return { ok: false, provider: 'resend', error };
    }

    const result = await response.json();
    const resendId = typeof result?.id === 'string' ? result.id : '';
    console.log(`[email] resend sent id=${resendId} to=${to} subject="${subject}"`);
    return { ok: true, provider: 'resend', id: resendId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { ok: false, provider: 'resend', error: error instanceof Error ? error.message : String(error) };
  }
}