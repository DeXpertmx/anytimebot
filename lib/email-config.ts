// Email (Resend) configuration.
//
// The Resend API key can be configured from the admin panel. When saved
// (SystemSetting key "email.credentials"), the stored value takes precedence
// over the RESEND_API_KEY environment variable, so enabling email delivery
// does not require environment changes or redeploys.

import { prisma } from '@/lib/db';

const CREDENTIALS_KEY = 'email.credentials';

export interface EmailCredentials {
  apiKey: string;
}

type StoredCredentials = Partial<EmailCredentials>;

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
export async function saveEmailCredentials(creds: Partial<EmailCredentials>): Promise<void> {
  const current = (await getCredentialsRecord()) ?? {};

  const next: Partial<EmailCredentials> = {};
  (Object.keys(creds) as Array<keyof EmailCredentials>).forEach((key) => {
    if (typeof creds[key] === 'string' && creds[key] !== '') {
      next[key] = (creds[key] as string).trim();
    } else if (current[key]) {
      next[key] = current[key];
    }
  });

  if (!next.apiKey) {
    await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
    return;
  }

  await prisma.systemSetting.upsert({
    where: { key: CREDENTIALS_KEY },
    create: { key: CREDENTIALS_KEY, value: next },
    update: { value: next },
  });
}

/** Removes the admin-saved credentials (fallback to env var). */
export async function clearEmailCredentials(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  await prisma.systemSetting.deleteMany({ where: { key: CREDENTIALS_KEY } });
}

/**
 * Returns the active Resend API key: admin-saved value if present, otherwise
 * the RESEND_API_KEY environment variable. Empty when email is not configured.
 */
export async function getResendApiKey(): Promise<string> {
  const envKey = process.env.RESEND_API_KEY || '';
  const stored = (await getCredentialsRecord())?.apiKey;
  return stored || envKey;
}

/** Whether a usable Resend API key is available (stored or via env). */
export async function isEmailConfigured(): Promise<boolean> {
  const apiKey = await getResendApiKey();
  return Boolean(apiKey && apiKey !== 're_placeholder');
}

/** Whether credentials were saved from the admin panel (may override env). */
export async function hasStoredEmailCredentials(): Promise<boolean> {
  const stored = await getCredentialsRecord();
  return Boolean(stored?.apiKey);
}
