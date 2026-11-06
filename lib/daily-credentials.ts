/**
 * Daily.co credentials resolution
 *
 * Each tenant connects its own Daily account (one domain + one API key per
 * Daily account) so it keeps its own 10,000 free participant-minutes per
 * month and Daily bills the tenant directly for the excess.
 *
 * The platform key in DAILY_API_KEY is only a fallback for tenants that have
 * not connected an account yet (shared pool, so it is not a per-tenant quota).
 */

import { prisma } from '@/lib/db';

export const DAILY_PROVIDER = 'daily';

export interface DailyCredentials {
  apiKey: string;
  domain: string | null;
  source: 'tenant' | 'platform';
}

/**
 * Get the Daily credentials for a user (booking page owner).
 */
export async function getDailyCredentialsForUser(
  userId?: string | null
): Promise<DailyCredentials | null> {
  if (userId) {
    const connection = await prisma.integrationConnection.findUnique({
      where: { userId_provider: { userId, provider: DAILY_PROVIDER } },
      select: { accessToken: true, providerAccountId: true },
    });

    const tenantKey = connection?.accessToken?.trim();
    if (tenantKey) {
      return {
        apiKey: tenantKey,
        domain: connection?.providerAccountId ?? null,
        source: 'tenant',
      };
    }
  }

  const platformKey = process.env.DAILY_API_KEY?.trim();
  if (platformKey) {
    return { apiKey: platformKey, domain: null, source: 'platform' };
  }

  return null;
}
