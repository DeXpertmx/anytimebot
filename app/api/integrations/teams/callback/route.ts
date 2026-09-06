import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { exchangeTeamsCode } from '@/lib/teams';
import { syncProviderAccountProfile } from '@/lib/video-providers';
import { getAppBaseUrl } from '@/lib/oauth-state';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/teams/callback?code=...&state=...
 * Exchanges the authorization code, stores the tenant's tokens and redirects
 * back to Integraciones (Videollamadas tab).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const stateCookie = request.cookies.get('teams_oauth_state')?.value;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  const redirect = (params: Record<string, string>) => {
    const url = new URL('/dashboard/integrations', getAppBaseUrl());
    url.searchParams.set('tab', 'video');
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };

  if (!code || !state || !stateCookie || state !== stateCookie) {
    return redirect({ error: 'teams' });
  }

  try {
    const redirectUri = `${getAppBaseUrl()}/api/integrations/teams/callback`;
    const tokens = await exchangeTeamsCode(code, redirectUri);
    const userId = (session.user as any).id as string;

    await prisma.integrationConnection.upsert({
      where: { userId_provider: { userId, provider: 'teams' } },
      create: {
        userId,
        provider: 'teams',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || null,
        expiresAt: tokens.expiresAt || null,
        scope: tokens.scope || null,
        tokenType: 'Bearer',
        tenantId: tokens.tenantId || null,
        providerAccountId: tokens.objectId || null,
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || undefined,
        expiresAt: tokens.expiresAt || null,
        scope: tokens.scope || undefined,
        tokenType: 'Bearer',
        tenantId: tokens.tenantId || undefined,
        providerAccountId: tokens.objectId || undefined,
      },
    });

    // Resolve the connected account (id, email, display name) for the UI.
    await syncProviderAccountProfile(userId, 'teams').catch((error) =>
      console.error('Failed to sync Teams profile:', error)
    );

    return redirect({ connected: 'teams' });
  } catch (error) {
    console.error('Teams callback error:', error);
    return redirect({ error: 'teams' });
  }
}