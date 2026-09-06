/**
 * Per-tenant video provider connections (Zoom, Microsoft Teams).
 *
 * Loads the tenant's OAuth connection from the database, refreshes the access
 * token when needed and creates the meeting on the TENANT's own account. Used
 * at booking time to auto-generate the join link for event types configured
 * with provider ZOOM or TEAMS.
 */

import { prisma } from '@/lib/db';
import {
  createZoomMeetingWithToken,
  refreshZoomToken,
  getZoomUser,
  zoomCredentials,
  zoomAccountCredentials,
  getZoomAccountAccessToken,
  getZoomS2sHost,
  type ZoomMeetingResult,
} from '@/lib/zoom';
import {
  createTeamsMeetingWithToken,
  refreshTeamsToken,
  getTeamsUser,
  teamsCredentials,
  type TeamsMeetingResult,
} from '@/lib/teams';

export type VideoProviderName = 'zoom' | 'teams';

export interface ProviderMeetingResult {
  roomUrl?: string;
  hostRoomUrl?: string;
  roomName?: string;
  password?: string;
  error?: string;
}

interface CreateProviderMeetingInput {
  userId: string;
  provider: VideoProviderName;
  topic: string;
  startTime: Date;
  duration: number;
  timezone?: string;
  agenda?: string;
  attendeeEmails?: string[];
}

/** Load the connection row and return a fresh (non-expired) access token. */
async function getFreshAccessToken(
  userId: string,
  provider: VideoProviderName
): Promise<{ accessToken: string; accountId: string | null } | null> {
  const conn = await prisma.integrationConnection.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!conn?.accessToken) return null;

  const now = Date.now();
  // Refresh when expired or within 5 minutes of expiry.
  if (!conn.expiresAt || conn.expiresAt.getTime() - now < 5 * 60 * 1000) {
    if (!conn.refreshToken) return null;
    try {
      const refreshed =
        provider === 'zoom'
          ? await refreshZoomToken(conn.refreshToken)
          : await refreshTeamsToken(conn.refreshToken);
      await prisma.integrationConnection.update({
        where: { id: conn.id },
        data: {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? conn.refreshToken,
          expiresAt: refreshed.expiresAt ?? null,
        },
      });
      return { accessToken: refreshed.accessToken, accountId: conn.providerAccountId };
    } catch (error) {
      console.error(`Failed to refresh ${provider} token:`, error);
      return null;
    }
  }

  return { accessToken: conn.accessToken, accountId: conn.providerAccountId };
}

/**
 * Create a meeting on the tenant's connected account. Returns no roomUrl when
 * the provider is not configured/connected or the API call failed — callers
 * then fall back to a manually pasted link.
 */
export async function createProviderMeeting(
  input: CreateProviderMeetingInput
): Promise<ProviderMeetingResult> {
  const { userId, provider, topic, startTime, duration, timezone, agenda, attendeeEmails } = input;

  if (provider === 'zoom') {
    // Preferred: the tenant's own connected Zoom account (per-user OAuth).
    const fresh = await getFreshAccessToken(userId, 'zoom');
    if (fresh?.accessToken && fresh.accountId) {
      const result: ZoomMeetingResult = await createZoomMeetingWithToken(
        fresh.accessToken,
        fresh.accountId,
        { topic, startTime, duration, timezone, agenda }
      );
      if (!result.success) return { error: result.error || 'Zoom meeting creation failed' };
      return {
        roomUrl: result.joinUrl,
        hostRoomUrl: result.hostStartUrl || result.joinUrl,
        roomName: result.meetingId,
        password: result.password,
      };
    }

    // Fallback: the platform's Server-to-Server Zoom account, so bookings
    // still get a real meeting when the tenant hasn't connected their own.
    if (!zoomAccountCredentials()) {
      return { error: zoomCredentials() ? 'Zoom not connected' : 'Zoom app not configured' };
    }
    try {
      const token = await getZoomAccountAccessToken();
      const host = await getZoomS2sHost();
      const result: ZoomMeetingResult = await createZoomMeetingWithToken(
        token,
        host.userId,
        { topic, startTime, duration, timezone, agenda }
      );
      if (!result.success) return { error: result.error || 'Zoom meeting creation failed' };
      return {
        roomUrl: result.joinUrl,
        hostRoomUrl: result.hostStartUrl || result.joinUrl,
        roomName: result.meetingId,
        password: result.password,
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Zoom account meeting failed' };
    }
  }

  // Teams
  if (!teamsCredentials()) {
    return { error: 'Teams app not configured' };
  }
  const fresh = await getFreshAccessToken(userId, 'teams');
  if (!fresh?.accessToken) {
    return { error: 'Teams not connected' };
  }
  const result: TeamsMeetingResult = await createTeamsMeetingWithToken(fresh.accessToken, {
    topic,
    startTime,
    duration,
    timezone,
    agenda,
    attendees: attendeeEmails,
  });
  if (!result.success) return { error: result.error || 'Teams meeting creation failed' };
  return {
    roomUrl: result.joinUrl,
    hostRoomUrl: result.joinUrl,
    roomName: result.meetingId,
  };
}

export interface VideoConnectionStatus {
  connected: boolean;
  accountEmail?: string;
  accountDisplayName?: string;
  error?: string;
  /** True when the platform's Server-to-Server Zoom account is available. */
  platformManaged?: boolean;
}

/**
 * Audit trail: record a Zoom/Teams meeting creation attempt (success or
 * failure) so admins can trace when a meeting was created or why it failed.
 * Best-effort — never throws, so a logging failure can't break a booking.
 */
export async function recordVideoMeetingLog(input: {
  userId: string;
  bookingId: string;
  provider: VideoProviderName;
  success: boolean;
  roomUrl?: string | null;
  meetingId?: string | null;
  error?: string | null;
}): Promise<void> {
  try {
    await prisma.videoMeetingLog.create({
      data: {
        userId: input.userId,
        bookingId: input.bookingId,
        provider: input.provider,
        success: input.success,
        roomUrl: input.roomUrl ?? null,
        meetingId: input.meetingId ?? null,
        error: input.error ?? null,
      },
    });
  } catch (error) {
    // Never break the booking flow because of audit logging.
    console.error('Failed to record video meeting log:', error);
  }
}

/** Status of both providers for the Integraciones UI. */
export async function getVideoConnectionsStatus(
  userId: string
): Promise<Record<VideoProviderName, VideoConnectionStatus>> {
  const rows = await prisma.integrationConnection.findMany({
    where: { userId, provider: { in: ['zoom', 'teams'] } },
  });

  const status: Record<VideoProviderName, VideoConnectionStatus> = {
    zoom: { connected: false, error: zoomCredentials() ? undefined : 'not_configured' },
    teams: { connected: false, error: teamsCredentials() ? undefined : 'not_configured' },
  };

  for (const row of rows) {
    const key = row.provider as VideoProviderName;
    if (!status[key]) continue;
    status[key] = {
      connected: true,
      accountEmail: row.accountEmail || undefined,
      accountDisplayName: row.accountDisplayName || undefined,
    };
  }

  // When the platform has a Server-to-Server Zoom account configured, Zoom is
  // available to every tenant without a personal connection (meetings are
  // created on the platform account).
  if (!rows.some((r) => r.provider === 'zoom') && zoomAccountCredentials()) {
    status.zoom = {
      connected: true,
      platformManaged: true,
      accountDisplayName: process.env.ZOOM_HOST_EMAIL || 'Cuenta de Zoom de Anytimebot',
      accountEmail: process.env.ZOOM_HOST_EMAIL || undefined,
    };
  }

  return status;
}

/** Look up the connected account profile and persist it for display. */
export async function syncProviderAccountProfile(
  userId: string,
  provider: VideoProviderName
): Promise<{ email?: string; displayName?: string; accountId?: string; tenantId?: string } | null> {
  const conn = await prisma.integrationConnection.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!conn?.accessToken) return null;

  const profile =
    provider === 'zoom'
      ? await getZoomUser(conn.accessToken)
      : await getTeamsUser(conn.accessToken);
  if (!profile) return null;

  await prisma.integrationConnection.update({
    where: { id: conn.id },
    data: {
      providerAccountId: profile.id,
      accountEmail: profile.email || null,
      accountDisplayName: profile.displayName || null,
      tenantId: (profile as { tenantId?: string }).tenantId ?? conn.tenantId,
    },
  });
  return { email: profile.email, displayName: profile.displayName, accountId: profile.id };
}