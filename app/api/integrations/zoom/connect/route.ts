import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildZoomAuthorizeUrl } from '@/lib/zoom';
import { getAppBaseUrl, createOAuthState } from '@/lib/oauth-state';

export const dynamic = 'force-dynamic';

/**
 * GET /api/integrations/zoom/connect
 * Starts the per-tenant Zoom OAuth flow (consent screen on zoom.us).
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  const state = createOAuthState();
  const redirectUri = `${getAppBaseUrl()}/api/integrations/zoom/callback`;

  const url = buildZoomAuthorizeUrl(redirectUri, state);

  const response = NextResponse.redirect(url);
  response.cookies.set('zoom_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 600,
    path: '/',
  });
  return response;
}