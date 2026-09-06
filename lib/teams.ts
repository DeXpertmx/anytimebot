/**
 * Microsoft Teams Integration Service
 *
 * Creates Teams online meetings on the CONNECTED TENANT's account using a
 * DELEGATED Microsoft Graph access token (the tenant authorizes with their
 * own Microsoft work/school account; the platform provides the Entra app
 * credentials TEAMS_CLIENT_ID / TEAMS_CLIENT_SECRET / TEAMS_TENANT_ID).
 *
 * OAuth flow:
 *   GET /api/integrations/teams/connect  -> redirect to Microsoft consent
 *   GET /api/integrations/teams/callback -> exchange code, store tokens
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/common';

export const TEAMS_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'User.Read',
  'Calendars.ReadWrite',
];

export function teamsCredentials(): {
  clientId: string;
  clientSecret: string;
  tenantId: string;
} | null {
  const clientId = process.env.TEAMS_CLIENT_ID;
  const clientSecret = process.env.TEAMS_CLIENT_SECRET;
  const tenantId = process.env.TEAMS_TENANT_ID;
  if (!clientId || !clientSecret || !tenantId) return null;
  return { clientId, clientSecret, tenantId };
}

/** Build the OAuth consent URL a tenant is redirected to. */
export function buildTeamsAuthorizeUrl(redirectUri: string, state: string): string {
  const creds = teamsCredentials();
  if (!creds) {
    throw new Error('Teams OAuth app is not configured (TEAMS_CLIENT_ID / TEAMS_CLIENT_SECRET / TEAMS_TENANT_ID)');
  }
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: TEAMS_SCOPES.join(' '),
    state,
    // openid so we get id_token claims (tid/oid) for display and tenant.
    nonce: Math.random().toString(36).slice(2),
  });
  return `${MICROSOFT_AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

/** Exchange the OAuth authorization code for tokens (v2.0 token endpoint). */
export async function exchangeTeamsCode(
  code: string,
  redirectUri: string
): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  tenantId?: string;
  objectId?: string;
}> {
  const creds = teamsCredentials();
  if (!creds) {
    throw new Error('Teams OAuth app is not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: TEAMS_SCOPES.join(' '),
  });
  const res = await fetch(`${MICROSOFT_AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Teams token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    scope: data.scope,
    tenantId: data.tid,
    objectId: data.oid,
  };
}

/** Refresh an expired Microsoft Graph access token. */
export async function refreshTeamsToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}> {
  const creds = teamsCredentials();
  if (!creds) {
    throw new Error('Teams OAuth app is not configured');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: TEAMS_SCOPES.join(' '),
  });
  const res = await fetch(`${MICROSOFT_AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Teams token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || undefined,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
  };
}

/** Profile of the connected user (for the Integraciones UI). */
export async function getTeamsUser(accessToken: string): Promise<{
  id: string;
  email?: string;
  displayName?: string;
  tenantId?: string;
} | null> {
  const res = await fetch(`${GRAPH_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    id: data.id,
    email: data.mail || data.userPrincipalName,
    displayName: data.displayName,
    tenantId: data.tenantId,
  };
}

export interface TeamsMeetingParams {
  topic: string;
  startTime: Date;
  duration: number; // minutes
  timezone?: string;
  agenda?: string;
  attendees?: string[]; // email addresses
}

export interface TeamsMeetingResult {
  success: boolean;
  meetingId?: string;
  joinUrl?: string;
  error?: string;
}

/** Pure helper: Graph event payload with an online meeting (testable). */
export function buildTeamsMeetingPayload(params: TeamsMeetingParams): Record<string, unknown> {
  const { topic, startTime, duration, timezone = 'UTC', agenda, attendees = [] } = params;
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
  return {
    subject: topic,
    startDateTime: startTime.toISOString(),
    endDateTime: endTime.toISOString(),
    timeZone: timezone,
    body: { contentType: 'text', content: agenda || '' },
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    attendees: attendees.map((email) => ({
      emailAddress: { address: email },
      type: 'required',
    })),
  };
}

/**
 * Create a Teams online meeting with the tenant's delegated access token.
 * Never fabricates placeholder URLs: unconfigured/disconnected returns
 * success:false and the caller falls back to a manual link.
 */
export async function createTeamsMeetingWithToken(
  accessToken: string,
  params: TeamsMeetingParams
): Promise<TeamsMeetingResult> {
  try {
    const response = await fetch(`${GRAPH_BASE}/me/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(buildTeamsMeetingPayload(params)),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      return {
        success: false,
        error: errorData?.error?.message || `Teams API error (${response.status})`,
      };
    }

    const data = await response.json();
    return {
      success: true,
      meetingId: data.id,
      joinUrl: data.onlineMeeting?.joinUrl || data.onlineMeeting?.joinWebUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Teams error',
    };
  }
}