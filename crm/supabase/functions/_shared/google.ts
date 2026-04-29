// ============================================================
// Google Calendar API Integration (OAuth2)
// ============================================================

export interface GoogleCredentials {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

/**
 * Obtém um novo Access Token usando o Refresh Token
 */
export async function getAccessToken(creds: GoogleCredentials): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Falha ao obter Access Token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

/**
 * Cria um evento no Google Calendar com link do Meet
 */
export async function createCalendarEvent(
  accessToken: string,
  eventData: {
    summary: string;
    description: string;
    start: string; // ISO String
    end: string;   // ISO String
    attendeeEmail: string;
    attendeeName: string;
  }
) {
  const event = {
    summary: eventData.summary,
    description: eventData.description,
    start: { dateTime: eventData.start, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: eventData.end, timeZone: 'America/Sao_Paulo' },
    attendees: [
      { email: eventData.attendeeEmail, displayName: eventData.attendeeName }
    ],
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`Erro ao criar evento: ${JSON.stringify(data.error)}`);
  }

  return {
    eventId: data.id,
    meetLink: data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri || data.hangoutLink
  };
}
