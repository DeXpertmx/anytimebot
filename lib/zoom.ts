/**
 * Zoom Integration Service
 *
 * Creates Zoom meetings on the CONNECTED TENANT's account using their own
 * OAuth access token (per-user OAuth, Calendly-style). The platform only
 * provides the OAuth app credentials (ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET).
 * Tokens are refreshed with the stored refresh token when expired.
 *
 * OAuth flow:
 *   GET /api/integrations/zoom/connect  -> redirect to Zoom consent
 *   GET /api/integrations/zoom/callback -> exchange code, store tokens
 */

const ZOOM_TOKEN_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

export function zoomCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** Build the OAuth consent URL a tenant is redirected to. */
export function buildZoomAuthorizeUrl(redirectUri: string, state: string): string {
  const creds = zoomCredentials();
  if (!creds) {
    throw new Error('Zoom OAuth app is not configured (ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET)');
  }
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // Granular scopes: create/read meetings and read the user's profile.
    scope: 'meeting:write meeting:read user:read',
    state,
  });
  return `https://zoom.us/oauth/authorize?${params.toString()}`;
}

/** Exchange the OAuth authorization code for tokens. */
export async function exchangeZoomCode(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}> {
  const creds = zoomCredentials();
  if (!creds) {
    throw new Error('Zoom OAuth app is not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    scope: data.scope,
  };
}

/** Refresh an expired Zoom access token. */
export async function refreshZoomToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}> {
  const creds = zoomCredentials();
  if (!creds) {
    throw new Error('Zoom OAuth app is not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  });
  const res = await fetch(ZOOM_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zoom token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || undefined,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
  };
}

/** Profile of the connected Zoom user (used for the Integraciones UI). */
export async function getZoomUser(accessToken: string): Promise<{
  id: string;
  email?: string;
  displayName?: string;
} | null> {
  const res = await fetch(`${ZOOM_API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    id: data.id,
    email: data.email,
    displayName: `${data.first_name || ''} ${data.last_name || ''}`.trim() || data.email,
  };
}

export interface ZoomMeetingParams {
  topic: string;
  startTime: Date;
  duration: number; // minutes
  timezone?: string;
  agenda?: string;
}

export interface ZoomMeetingResult {
  success: boolean;
  meetingId?: string;
  joinUrl?: string;
  hostStartUrl?: string;
  password?: string;
  error?: string;
}

/** Pure helper: Zoom API payload for a scheduled meeting (testable). */
export function buildZoomMeetingPayload(params: ZoomMeetingParams): Record<string, unknown> {
  const { topic, startTime, duration, timezone = 'UTC', agenda } = params;
  return {
    topic,
    type: 2, // Scheduled meeting
    start_time: startTime.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''),
    duration,
    timezone,
    agenda: agenda || '',
    settings: {
      host_video: true,
      participant_video: true,
      waiting_room: true,
      join_before_host: false,
      auto_recording: 'cloud',
      allow_multiple_devices: true,
    },
  };
}

/**
 * Create a Zoom meeting with the tenant's access token.
 * Never fabricates placeholder URLs: when Zoom is not configured/connected
 * the call returns success:false and the caller falls back to a manual link.
 */
export async function createZoomMeetingWithToken(
  accessToken: string,
  userId: string,
  params: ZoomMeetingParams
): Promise<ZoomMeetingResult> {
  try {
    const response = await fetch(`${ZOOM_API_BASE}/users/${encodeURIComponent(userId)}/meetings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(buildZoomMeetingPayload(params)),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return {
        success: false,
        error: errorData?.message || `Zoom API error (${response.status})`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      meetingId: data.id?.toString(),
      joinUrl: data.join_url,
      hostStartUrl: data.start_url,
      password: data.password,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Zoom error',
    };
  }
}