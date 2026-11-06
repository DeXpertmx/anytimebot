/**
 * Daily.co API Integration
 * For creating and managing video rooms
 *
 * Every function accepts an optional `apiKey`. Video rooms are created on the
 * tenant's own Daily account (so the tenant keeps its 10,000 free
 * participant-minutes per month); DAILY_API_KEY is only the platform fallback.
 */

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
 * Resolve the API key for a call: tenant key first, platform key as fallback.
 */
function resolveApiKey(apiKey?: string | null): string | null {
  const key = apiKey?.trim() || process.env.DAILY_API_KEY?.trim();
  return key || null;
}

/**
 * Validate an API key and return the domain it belongs to.
 * Used by the Integraciones card to test a key before saving it.
 */
export async function getDailyDomain(
  apiKey: string
): Promise<{ ok: boolean; domain?: string; status?: number; error?: string }> {
  const key = apiKey?.trim();
  if (!key) {
    return { ok: false, error: 'Falta la API key' };
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/`, {
      headers: { 'Authorization': `Bearer ${key}` },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error:
          response.status === 401
            ? 'API key no válida'
            : `Daily respondió con estado ${response.status}`,
      };
    }

    const data = await response.json();
    const domain = typeof data?.domain_name === 'string' ? data.domain_name : undefined;
    return { ok: true, domain };
  } catch (error: any) {
    console.error('Error validating Daily.co API key:', error);
    return { ok: false, error: 'No se pudo contactar con Daily' };
  }
}

/**
 * Create a Daily.co room for a meeting
 */
export async function createDailyRoom(
  config: DailyRoomConfig,
  apiKey?: string
): Promise<CreateRoomResponse> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return { success: false, error: 'Daily.co API key not configured' };
  }

  try {
    // Set expiration to 24 hours after meeting start
    const exp = config.properties?.exp || Math.floor(Date.now() / 1000) + (24 * 60 * 60);

    const response = await fetch(`${DAILY_API_URL}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
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
export async function createMeetingToken(
  roomName: string,
  isHost: boolean = false,
  apiKey?: string
): Promise<string | null> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return null;
  }

  try {
    const exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

    const response = await fetch(`${DAILY_API_URL}/meeting-tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
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
export async function deleteDailyRoom(roomName: string, apiKey?: string): Promise<boolean> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${key}`,
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
export async function getDailyRoom(roomName: string, apiKey?: string): Promise<DailyRoom | null> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return null;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}`, {
      headers: {
        'Authorization': `Bearer ${key}`,
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
export async function startRecording(roomName: string, apiKey?: string): Promise<boolean> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}/recordings/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
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
export async function stopRecording(roomName: string, apiKey?: string): Promise<boolean> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}/recordings/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
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
export async function getRoomRecordings(roomName: string, apiKey?: string): Promise<any[]> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return [];
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/recordings?room_name=${roomName}`, {
      headers: {
        'Authorization': `Bearer ${key}`,
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
export async function startTranscription(roomName: string, apiKey?: string): Promise<boolean> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}/transcription/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
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
export async function stopTranscription(roomName: string, apiKey?: string): Promise<boolean> {
  const key = resolveApiKey(apiKey);
  if (!key) {
    return false;
  }

  try {
    const response = await fetch(`${DAILY_API_URL}/rooms/${roomName}/transcription/stop`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error stopping transcription:', error);
    return false;
  }
}
