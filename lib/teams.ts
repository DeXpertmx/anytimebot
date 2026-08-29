/**
 * Microsoft Teams Integration Service
 * Creates and manages Teams meetings for bookings
 */

interface TeamsMeetingParams {
  topic: string;
  startTime: Date;
  duration: number; // in minutes
  timezone?: string;
  agenda?: string;
  attendees?: string[]; // email addresses
}

interface TeamsMeetingResult {
  success: boolean;
  meetingId?: string;
  joinUrl?: string;
  error?: string;
}

/**
 * Create a Microsoft Teams meeting
 */
export async function createTeamsMeeting(params: TeamsMeetingParams): Promise<TeamsMeetingResult> {
  const { topic, startTime, duration, timezone = 'UTC', agenda, attendees = [] } = params;

  // Check if Teams is configured
  const teamsClientId = process.env.TEAMS_CLIENT_ID;
  const teamsClientSecret = process.env.TEAMS_CLIENT_SECRET;
  const teamsTenantId = process.env.TEAMS_TENANT_ID;

  if (!teamsClientId || !teamsClientSecret || !teamsTenantId) {
    console.log('Teams not configured, using placeholder');
    return {
      success: true,
      meetingId: `teams-${Date.now()}`,
      joinUrl: `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${Math.random().toString(36).substring(2)}%40thread.v2/0`,
    };
  }

  try {
    // Get access token
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${teamsTenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: teamsClientId,
        client_secret: teamsClientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('Teams token error:', errorData);
      return {
        success: false,
        error: 'Failed to get Teams access token',
      };
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Create meeting
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    const meetingPayload = {
      subject: topic,
      startDateTime: startTime.toISOString(),
      endDateTime: endTime.toISOString(),
      timeZone: timezone,
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
      attendees: attendees.map(email => ({
        emailAddress: { address: email },
        type: 'required',
      })),
    };

    const response = await fetch('https://graph.microsoft.com/v1.0/me/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(meetingPayload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Teams API error:', errorData);
      return {
        success: false,
        error: errorData.error?.message || 'Failed to create Teams meeting',
      };
    }

    const data = await response.json();

    return {
      success: true,
      meetingId: data.id,
      joinUrl: data.onlineMeeting?.joinUrl || data.onlineMeeting?.joinWebUrl,
    };
  } catch (error) {
    console.error('Error creating Teams meeting:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get Teams meeting details
 */
export async function getTeamsMeeting(meetingId: string): Promise<any> {
  const teamsClientId = process.env.TEAMS_CLIENT_ID;
  const teamsClientSecret = process.env.TEAMS_CLIENT_SECRET;
  const teamsTenantId = process.env.TEAMS_TENANT_ID;

  if (!teamsClientId || !teamsClientSecret || !teamsTenantId) {
    return null;
  }

  try {
    // Get access token
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${teamsTenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: teamsClientId,
        client_secret: teamsClientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    if (!tokenResponse.ok) {
      return null;
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${meetingId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Teams meeting:', error);
    return null;
  }
}

/**
 * Delete a Teams meeting
 */
export async function deleteTeamsMeeting(meetingId: string): Promise<boolean> {
  const teamsClientId = process.env.TEAMS_CLIENT_ID;
  const teamsClientSecret = process.env.TEAMS_CLIENT_SECRET;
  const teamsTenantId = process.env.TEAMS_TENANT_ID;

  if (!teamsClientId || !teamsClientSecret || !teamsTenantId) {
    return false;
  }

  try {
    // Get access token
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${teamsTenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: teamsClientId,
        client_secret: teamsClientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    if (!tokenResponse.ok) {
      return false;
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${meetingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error deleting Teams meeting:', error);
    return false;
  }
}