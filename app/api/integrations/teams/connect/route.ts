import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildTeamsAuthorizeUrl } from '@/lib/teams';
import { getAppBaseUrl, createOAuthState } from '@/lib/oauth-state';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/teams/connect
 * Starts the per-tenant Microsoft Teams OAuth flow (consent on login.microsoftonline.com).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  const state = createOAuthState();
  const redirectUri = `${getAppBaseUrl()}/api/integrations/teams/callback`;

  const url = buildTeamsAuthorizeUrl(redirectUri, state);

  const response = NextResponse.redirect(url);
  response.cookies.set('teams_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });
  return response;
}