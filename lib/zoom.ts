/**
 * Zoom Integration Service
 * Creates and manages Zoom meetings for bookings
 */

interface ZoomMeetingParams {
  topic: string;
  startTime: Date;
  duration: number; // in minutes
  timezone?: string;
  agenda?: string;
}

interface ZoomMeetingResult {
  success: boolean;
  meetingId?: string;
  joinUrl?: string;
  password?: string;
  error?: string;
}

/**
 * Create a Zoom meeting
 */
export async function createZoomMeeting(params: ZoomMeetingParams): Promise<ZoomMeetingResult> {
  const { topic, startTime, duration, timezone = 'UTC', agenda } = params;

  // Check if Zoom is configured
  const zoomAccountId = process.env.ZOOM_ACCOUNT_ID;
  const zoomClientId = process.env.ZOOM_CLIENT_ID;
  const zoomClientSecret = process.env.ZOOM_CLIENT_SECRET;
  const zoomJwtToken = process.env.ZOOM_JWT_TOKEN;

  if (!zoomJwtToken && (!zoomClientId || !zoomClientSecret)) {
    console.log('Zoom not configured, using placeholder');
    return {
      success: true,
      meetingId: `zoom-${Date.now()}`,
      joinUrl: `https://zoom.us/j/${Math.floor(Math.random() * 1000000000)}`,
      password: Math.random().toString(36).substring(2, 8),
    };
  }

  try {
    // Format the start time for Zoom API
    const startDateTime = startTime.toISOString().replace('T', ' ').replace('Z', '');

    const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${zoomJwtToken}`,
      },
      body: JSON.stringify({
        topic,
        type: 2, // Scheduled meeting
        start_time: startDateTime,
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
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Zoom API error:', errorData);
      return {
        success: false,
        error: errorData.message || 'Failed to create Zoom meeting',
      };
    }

    const data = await response.json();

    return {
      success: true,
      meetingId: data.id?.toString(),
      joinUrl: data.join_url,
      password: data.password,
    };
  } catch (error) {
    console.error('Error creating Zoom meeting:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get Zoom meeting details
 */
export async function getZoomMeeting(meetingId: string): Promise<any> {
  const zoomJwtToken = process.env.ZOOM_JWT_TOKEN;

  if (!zoomJwtToken) {
    return null;
  }

  try {
    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      headers: {
        'Authorization': `Bearer ${zoomJwtToken}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Zoom meeting:', error);
    return null;
  }
}

/**
 * Delete a Zoom meeting
 */
export async function deleteZoomMeeting(meetingId: string): Promise<boolean> {
  const zoomJwtToken = process.env.ZOOM_JWT_TOKEN;

  if (!zoomJwtToken) {
    return false;
  }

  try {
    const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${zoomJwtToken}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error deleting Zoom meeting:', error);
    return false;
  }
}