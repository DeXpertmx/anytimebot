
/**
 * Daily.co API Integration
 * For creating and managing video rooms
 */

const DAILY_API_KEY = process.env.DAILY_API_KEY;
const DAILY_API_URL = 'https://api.daily.co/v1';

interface DailyRoomConfig {
  name?: string;
  privacy?: 'public' | 'private';
  properties?: {
    enable_recording?: 'cloud' | 'local' | 'rtp-tracks';
    enable_transcription?: boolean;
    enable_live_streaming?: boolean;
    enable_chat?: boolean;
    enable_screenshare?: boolean;
    enable_knocking?: boolean;
    start_video_off?: boolean;
    start_audio_off?: boolean;
    max_participants?: number;
    exp?: number; // Room expiration time (Unix timestamp)
    eject_at_room_exp?: boolean;
  };
}

interface DailyRoom {
  id: string;
  name: string;
  api_created: boolean;
  privacy: string;
  url: string;
  created_at: string;
  config: any;
}

interface CreateRoomResponse {
  success: boolean;
  room?: DailyRoom;
  error?: string;
}

/**
 * Create a Daily.co room for a meeting
 */
export async function createDailyRoom(config: DailyRoomConfig): Promise<CreateRoomResponse> {
  if (!DAILY_API_KEY) {
    return { success: false, error: 'Daily.co API key not configured' };
  }

  try {
    // Set expiration to 24 hours after meeting start
    const exp = config.properties?.exp || Math.floor(Date.now() / 1000) + (24 * 60 * 60);

    const response = await fetch(`${DAILY_API_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        ...config,
        properties: {
          enable_chat: true,
          enable_screenshare: true,
          enable_knocking: false,
          start_video_off: false,
          start_audio_off: false,
          max_participants: 10,
          eject_at_room_exp: true,
          ...config.properties,
          exp,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Daily.co API error:', error);
      return { success: false, error: `Failed to create room: ${response.status}` };
    }

    const room: DailyRoom = await response.json();
    return { success: true, room };
  } catch (error: any) {
    console.error('Error creating Daily.co room:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get meeting token with specific permissions
 * Used to generate host tokens with elevated permissions
 */
export async function createMeetingToken(roomName: string, isHost: boolean = false): Promise<string | null> {
  if (!DAILY_API_KEY) {
    return null;
  }

  try {
    const exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

    const response = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          is_owner: isHost,
          enable_recording: isHost ? 'cloud' : undefined,
          enable_transcription: isHost,
          start_cloud_recording: false, // Manual start
          exp,
        },
      }),
    });

    if (!response.ok) {
      console.error('Failed to create meeting token:', response.status);
      return null;
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error('Error creating meeting token:', error);
    return null;
  }
}

/**
 * Delete a Daily.co room
 */
export async function deleteDailyRoom(roomName: string): Promise<boolean> {
  if (!DAILY_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error deleting Daily.co room:', error);
    return false;
  }
}

/**
 * Get room information
 */
export async function getDailyRoom(roomName: string): Promise<DailyRoom | null> {
  if (!DAILY_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching Daily.co room:', error);
    return null;
  }
}

/**
 * Start cloud recording for a room
 */
export async function startRecording(roomName: string): Promise<boolean> {
  if (!DAILY_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}/recordings/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error starting recording:', error);
    return false;
  }
}

/**
 * Stop cloud recording for a room
 */
export async function stopRecording(roomName: string): Promise<boolean> {
  if (!DAILY_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}/recordings/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error stopping recording:', error);
    return false;
  }
}

/**
 * Get recordings for a room
 */
export async function getRoomRecordings(roomName: string): Promise<any[]> {
  if (!DAILY_API_KEY) {
    return [];
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/recordings?room_name=${roomName}`, {
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching recordings:', error);
    return [];
  }
}

/**
 * Start live transcription for a room
 */
export async function startTranscription(roomName: string): Promise<boolean> {
  if (!DAILY_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}/transcription/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        language: 'es', // Default to Spanish, can be made dynamic
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Error starting transcription:', error);
    return false;
  }
}

/**
 * Stop live transcription
 */
export async function stopTranscription(roomName: string): Promise<boolean> {
  if (!DAILY_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}/transcription/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error stopping transcription:', error);
    return false;
  }
}
