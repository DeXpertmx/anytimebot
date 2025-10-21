
import { calendar_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from './db';

const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.NEXTAUTH_URL
);

export async function getCalendarClient(userId: string): Promise<calendar_v3.Calendar> {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: 'google',
    },
  });

  if (!account?.access_token) {
    throw new Error('No Google account connected');
  }

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Refresh token if expired
  if (account.expires_at && account.expires_at * 1000 < Date.now()) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await prisma.account.update({
      where: {
        id: account.id,
      },
      data: {
        access_token: credentials.access_token,
        refresh_token: credentials.refresh_token,
        expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : null,
      },
    });
    oauth2Client.setCredentials(credentials);
  }

  const { calendar } = google;
  return calendar({ version: 'v3', auth: oauth2Client });
}

export async function createCalendarEvent(
  userId: string,
  eventData: {
    summary: string;
    description?: string;
    location?: string;
    start: Date;
    end: Date;
    attendees?: string[];
  }
) {
  try {
    const calendar = await getCalendarClient(userId);

    const event = {
      summary: eventData.summary,
      description: eventData.description,
      location: eventData.location,
      start: {
        dateTime: eventData.start.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: eventData.end.toISOString(),
        timeZone: 'UTC',
      },
      attendees: eventData.attendees?.map((email) => ({ email })),
      reminders: {
        useDefault: true,
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all',
    });

    return response.data;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
}

export async function updateCalendarEvent(
  userId: string,
  eventId: string,
  eventData: {
    summary?: string;
    description?: string;
    location?: string;
    start?: Date;
    end?: Date;
    attendees?: string[];
  }
) {
  try {
    const calendar = await getCalendarClient(userId);

    const event: any = {};
    if (eventData.summary) event.summary = eventData.summary;
    if (eventData.description) event.description = eventData.description;
    if (eventData.location) event.location = eventData.location;
    if (eventData.start) {
      event.start = {
        dateTime: eventData.start.toISOString(),
        timeZone: 'UTC',
      };
    }
    if (eventData.end) {
      event.end = {
        dateTime: eventData.end.toISOString(),
        timeZone: 'UTC',
      };
    }
    if (eventData.attendees) {
      event.attendees = eventData.attendees.map((email) => ({ email }));
    }

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId,
      requestBody: event,
      sendUpdates: 'all',
    });

    return response.data;
  } catch (error) {
    console.error('Error updating calendar event:', error);
    throw error;
  }
}

export async function deleteCalendarEvent(userId: string, eventId: string) {
  try {
    const calendar = await getCalendarClient(userId);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });

    return { success: true };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    throw error;
  }
}

export async function checkAvailability(
  userId: string,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  try {
    const calendar = await getCalendarClient(userId);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
    });

    // If there are any events in this time range, the slot is not available
    return !response.data.items || response.data.items.length === 0;
  } catch (error) {
    console.error('Error checking availability:', error);
    // If there's an error, return true to not block bookings
    return true;
  }
}

export async function listCalendarEvents(
  userId: string,
  startDate: Date,
  endDate: Date
) {
  try {
    const calendar = await getCalendarClient(userId);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Error listing calendar events:', error);
    return [];
  }
}

export async function getCalendarInfo(userId: string) {
  try {
    const calendar = await getCalendarClient(userId);

    const response = await calendar.calendars.get({
      calendarId: 'primary',
    });

    return response.data;
  } catch (error) {
    console.error('Error getting calendar info:', error);
    throw error;
  }
}
