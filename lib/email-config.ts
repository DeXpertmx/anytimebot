// Email configuration.
//
// Email can be delivered through SMTP (preferred) or Resend. The credentials
// can be configured from the admin panel (SystemSetting key "email.credentials");
// when saved, the stored values take precedence over environment variables, so
// enabling email delivery does not require environment changes or redeploys.
//
// Environment fallbacks:
//   SMTP:     EMAIL_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER,
//             SMTP_PASS, SMTP_FROM_NAME, SMTP_FROM_EMAIL
//   Resend:   RESEND_API_KEY

import { prisma } from '@/lib/db';

const CREDENTIALS_KEY = 'email.credentials';

/** How the email provider is selected. 'auto' prefers SMTP when configured. */
export type EmailProvider = 'auto' | 'smtp' | 'resend';

export interface EmailCredentials {
  apiKey: string;
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: string;
  smtpSecure: string;
  smtpUser: string;
  smtpPass: string;
  smtpFromName: string;
  smtpFromEmail: string;
}

export type StoredCredentials = Partial<EmailCredentials>;

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  fromName: string;
  fromEmail: string;
}

const DEFAULT_FROM_NAME = 'ANYTIMEBOT';
const DEFAULT_FROM_EMAIL = 'noreply@anytimebot.app';

/** Reads the saved admin credentials. Returns null when nothing is stored. */
async function getCredentialsRecord(): Promise<StoredCredentials | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: CREDENTIALS_KEY },
      select: { value: true },
    });
    if (!row) return null;
    const value = row.value as unknown;
    if (typeof value !== 'object' || value === null) return null;
    return value as StoredCredentials;
  } catch (error) {
    console.warn('Could not read saved email credentials:', error);
    return null;
  }
}

/** Persists the email credentials (admin panel). Empty fields keep stored values. */
export async function saveEmailCredentials(
  creds: Partial<EmailCredentials> | { [key: string]: string | boolean | EmailProvider },
): Promise<void> {
  const current = (await getCredentialsRecord()) ?? {};

  const keys: Array<keyof EmailCredentials> = [
    'apiKey',
    'provider',
    'smtpHost',
    'smtpPort',
    'smtpSecure',
    'smtpUser',
    'smtpPass',
    'smtpFromName',
    'smtpFromEmail',
  ];

  const next: Partial<EmailCredentials> = {};
  keys.forEach((key) => {
    const value = creds[key as keyof EmailCredentials];
    if (typeof value === 'string' && value !== '') {
      (next as Record<string, string>)[key] = value.trim();
    } else if (typeof value === 'boolean') {
      (next as Record<string, string>)[key] = value ? 'true' : 'false';
    } else if (current[key]) {
      (next as Record<string, string>)[key] = current[key] as string;
    }
  });

  // Nothing meaningful stored → remove the record entirely (fall back to env).
  if (!next.apiKey && !next.smtpHost) {
    await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
    return;
  }

  await prisma.systemSetting.upsert({
    where: { key: CREDENTIALS_KEY },
    create: { key: CREDENTIALS_KEY, value: next },
    update: { value: next },
  });
}

/** Removes the admin-saved credentials (fallback to env vars). */
export async function clearEmailCredentials(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
}

/** Returns the active Resend API key: admin-saved value if present, otherwise env. */
export async function getResendApiKey(): Promise<string> {
  const envKey = process.env.RESEND_API_KEY || '';
  const stored = (await getCredentialsRecord())?.apiKey;
  return stored || envKey;
}

/** Resolves which provider should be used for sending. */
export async function resolveEmailProvider(): Promise<'smtp' | 'resend'> {
  const stored = await getCredentialsRecord();
  const storedProvider = stored?.provider || 'auto';
  const storedHost = stored?.smtpHost || '';

  if (storedProvider === 'smtp' && storedHost) return 'smtp';
  if (storedProvider === 'resend') return 'resend';

  const envProvider = (process.env.EMAIL_PROVIDER || 'auto').toLowerCase();
  const envHost = process.env.SMTP_HOST || '';

  if (envProvider === 'smtp' && envHost) return 'smtp';
  if (envProvider === 'resend') return 'resend';

  // auto: prefer SMTP when a host is configured anywhere.
  if (storedHost || envHost) return 'smtp';
  return 'resend';
}

/**
 * Returns the active SMTP configuration (admin-saved values take precedence
 * over environment variables) or null when SMTP is not configured.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const stored = await getCredentialsRecord();

  const host = stored?.smtpHost?.trim() || process.env.SMTP_HOST?.trim() || '';
  if (!host) return null;

  const rawPort = stored?.smtpPort?.trim() || process.env.SMTP_PORT?.trim() || '';
  const port = rawPort ? parseInt(rawPort, 10) : 587;
  const rawSecure = stored?.smtpSecure?.trim() || process.env.SMTP_SECURE?.trim() || '';
  const secure = rawSecure === 'true' || rawSecure === '1' ? true : port === 465;
  const user = stored?.smtpUser?.trim() || process.env.SMTP_USER?.trim() || '';
  const pass = stored?.smtpPass?.trim() || process.env.SMTP_PASS?.trim() || '';
  const fromName = stored?.smtpFromName?.trim() || process.env.SMTP_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
  const fromEmail = stored?.smtpFromEmail?.trim() || process.env.SMTP_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;

  return {
    host,
    port,
    secure,
    user: user || undefined,
    pass: pass || undefined,
    fromName,
    fromEmail,
  };
}

/** Whether a usable email provider is available (stored or via env). */
export async function isEmailConfigured(): Promise<boolean> {
  const provider = await resolveEmailProvider();
  if (provider === 'smtp') {
    const smtp = await getSmtpConfig();
    return Boolean(smtp?.host);
  }
  const apiKey = await getResendApiKey();
  return Boolean(apiKey && apiKey !== 're_placeholder');
}

/** Whether credentials were saved from the admin panel (may override env). */
export async function hasStoredEmailCredentials(): Promise<boolean> {
  const stored = await getCredentialsRecord();
  return Boolean(stored?.apiKey || stored?.smtpHost);
}