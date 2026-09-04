import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { allowedOriginFor, coachEmails, corsHeaders, jsonResponse, normalizeEmail, stringValue } from "../_shared/http.ts";

const calendarReadonlyScope = "https://www.googleapis.com/auth/calendar.readonly";
const trainingKeyword = "training";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function randomToken(byteLength = 48) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function googleErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const nestedError = record.error;

  if (nestedError && typeof nestedError === "object") {
    return stringValue((nestedError as Record<string, unknown>).message);
  }

  return stringValue(record.error_description) || stringValue(record.error);
}

function calendarEnv(request: Request) {
  const clientId = Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") || Deno.env.get("GOOGLE_HEALTH_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") || Deno.env.get("GOOGLE_HEALTH_CLIENT_SECRET") || "";
  const redirectUri = Deno.env.get("GOOGLE_CALENDAR_REDIRECT_URI") || `${allowedOriginFor(request)}/coach-overview.html`;
  const calendarId = Deno.env.get("GOOGLE_CALENDAR_ID") || "primary";

  return { clientId, clientSecret, redirectUri, calendarId };
}

async function tokenRequest(params: URLSearchParams) {
  return fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
}

async function getCoachEmail(request: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = request.headers.get("Authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return { email: "", error: "Sign in as coach first." };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await userClient.auth.getUser();
  const email = normalizeEmail(data.user?.email);

  if (error || !email) {
    return { email: "", error: "Could not verify coach login." };
  }

  if (!coachEmails().includes(email)) {
    return { email: "", error: "This login is not set up as a coach admin." };
  }

  return { email, error: "" };
}

async function refreshConnection(
  adminClient: ReturnType<typeof createClient>,
  connection: Record<string, unknown>,
  request: Request
) {
  const { clientId, clientSecret } = calendarEnv(request);
  const coachEmail = normalizeEmail(connection.coach_email);
  const refreshToken = stringValue(connection.refresh_token);

  if (!clientId || !clientSecret || !refreshToken || !coachEmail) {
    return { connection, error: "Google Calendar sync is not configured yet." };
  }

  const response = await tokenRequest(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  }));
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      connection,
      error: googleErrorMessage(payload) || "Google Calendar login expired. Reconnect Google Calendar."
    };
  }

  const expiresIn = Number(payload.expires_in || 3600);
  const nextConnection = {
    coach_email: coachEmail,
    calendar_id: stringValue(connection.calendar_id) || "primary",
    access_token: stringValue(payload.access_token),
    refresh_token: stringValue(payload.refresh_token) || refreshToken,
    scope: stringValue(payload.scope) || stringValue(connection.scope),
    token_type: stringValue(payload.token_type) || stringValue(connection.token_type) || "Bearer",
    expires_at: new Date(Date.now() + (expiresIn * 1000)).toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await adminClient
    .from("coach_google_calendar_connections")
    .upsert(nextConnection, { onConflict: "coach_email" })
    .select("*")
    .single();

  if (error) {
    return { connection, error: "Could not refresh Google Calendar login." };
  }

  return { connection: data, error: "" };
}

async function currentConnection(adminClient: ReturnType<typeof createClient>, coachEmail: string, request: Request) {
  const { data, error } = await adminClient
    .from("coach_google_calendar_connections")
    .select("*")
    .eq("coach_email", coachEmail)
    .maybeSingle();

  if (error || !data) {
    return { connection: null, error: "" };
  }

  const expiresAt = Date.parse(String(data.expires_at || ""));

  if (Number.isFinite(expiresAt) && expiresAt - Date.now() < 60000) {
    return refreshConnection(adminClient, data, request);
  }

  return { connection: data, error: "" };
}

function isTrainingSession(summary: string) {
  return summary.toLocaleLowerCase().includes(trainingKeyword);
}

function firstNonCoachAttendeeEmail(event: Record<string, unknown>, coachEmail: string) {
  const attendees = Array.isArray(event.attendees) ? event.attendees : [];

  for (const attendee of attendees) {
    if (!attendee || typeof attendee !== "object") {
      continue;
    }

    const email = normalizeEmail((attendee as Record<string, unknown>).email);

    if (email && email !== coachEmail) {
      return email;
    }
  }

  return "";
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }

  if (request.method !== "POST") {
    return jsonResponse(request, { error: "Use POST." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(request, { error: "Calendar sync is missing Supabase secrets." }, 500);
  }

  const { email: coachEmail, error: authError } = await getCoachEmail(request, supabaseUrl, anonKey);

  if (authError || !coachEmail) {
    return jsonResponse(request, { error: authError || "Sign in as coach first." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const safeBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const action = stringValue(safeBody.action);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  if (action === "start") {
    const { clientId, redirectUri } = calendarEnv(request);

    if (!clientId) {
      return jsonResponse(request, { error: "Google Calendar client ID is not configured yet." }, 500);
    }

    const state = randomToken(32);
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000)).toISOString();
    await adminClient
      .from("coach_google_calendar_oauth_states")
      .delete()
      .eq("coach_email", coachEmail);
    const { error: stateError } = await adminClient
      .from("coach_google_calendar_oauth_states")
      .insert({ state, coach_email: coachEmail, expires_at: expiresAt });

    if (stateError) {
      return jsonResponse(request, { error: "Could not begin Google Calendar login." }, 500);
    }

    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", calendarReadonlyScope);
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("include_granted_scopes", "true");
    authorizationUrl.searchParams.set("prompt", "consent");
    authorizationUrl.searchParams.set("state", state);

    return jsonResponse(request, { authorizationUrl: authorizationUrl.toString(), state });
  }

  if (action === "callback") {
    const { clientId, clientSecret, redirectUri, calendarId } = calendarEnv(request);
    const code = stringValue(safeBody.code);
    const state = stringValue(safeBody.state);

    if (!clientId || !clientSecret) {
      return jsonResponse(request, { error: "Google Calendar credentials are not configured yet." }, 500);
    }

    if (!code || !state) {
      return jsonResponse(request, { error: "Google Calendar login is missing required information." }, 400);
    }

    const { data: consumedState, error: stateError } = await adminClient
      .from("coach_google_calendar_oauth_states")
      .delete()
      .eq("state", state)
      .eq("coach_email", coachEmail)
      .gt("expires_at", new Date().toISOString())
      .select("state")
      .maybeSingle();

    if (stateError || !consumedState) {
      return jsonResponse(request, { error: "Google Calendar login could not be verified. Try connecting again." }, 400);
    }

    const response = await tokenRequest(new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    }));
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonResponse(request, { error: googleErrorMessage(payload) || "Could not connect Google Calendar." }, 400);
    }

    const accessToken = stringValue(payload.access_token);
    const refreshToken = stringValue(payload.refresh_token);

    if (!accessToken || !refreshToken) {
      return jsonResponse(request, {
        error: "Google did not provide long-term access. Reconnect and approve access again."
      }, 400);
    }

    const expiresIn = Number(payload.expires_in || 3600);
    const { error } = await adminClient
      .from("coach_google_calendar_connections")
      .upsert({
        coach_email: coachEmail,
        calendar_id: calendarId,
        access_token: accessToken,
        refresh_token: refreshToken,
        scope: stringValue(payload.scope) || calendarReadonlyScope,
        token_type: stringValue(payload.token_type) || "Bearer",
        expires_at: new Date(Date.now() + (expiresIn * 1000)).toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "coach_email" });

    if (error) {
      return jsonResponse(request, { error: "Could not save the Google Calendar connection." }, 500);
    }

    return jsonResponse(request, { connected: true });
  }

  if (action === "disconnect") {
    await Promise.all([
      adminClient.from("coach_google_calendar_connections").delete().eq("coach_email", coachEmail),
      adminClient.from("coach_google_calendar_oauth_states").delete().eq("coach_email", coachEmail)
    ]);

    return jsonResponse(request, { connected: false });
  }

  if (action === "today") {
    const { connection, error } = await currentConnection(adminClient, coachEmail, request);

    if (error) {
      return jsonResponse(request, { connected: false, error }, 400);
    }

    if (!connection) {
      return jsonResponse(request, { connected: false, sessions: [] });
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const calendarId = stringValue(connection.calendar_id) || "primary";
    const eventsUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`
    );
    eventsUrl.searchParams.set("timeMin", startOfDay.toISOString());
    eventsUrl.searchParams.set("timeMax", endOfDay.toISOString());
    eventsUrl.searchParams.set("singleEvents", "true");
    eventsUrl.searchParams.set("orderBy", "startTime");
    eventsUrl.searchParams.set("maxResults", "50");

    const response = await fetch(eventsUrl.toString(), {
      headers: { Authorization: `Bearer ${stringValue(connection.access_token)}` }
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonResponse(request, {
        connected: true,
        sessions: [],
        error: googleErrorMessage(payload) || "Could not load today's sessions from Google Calendar."
      }, 502);
    }

    const events = Array.isArray(payload.items) ? payload.items as Record<string, unknown>[] : [];
    const trainingEvents = events.filter((event) => isTrainingSession(stringValue(event.summary)));

    const attendeeEmails = Array.from(new Set(
      trainingEvents
        .map((event) => firstNonCoachAttendeeEmail(event, coachEmail))
        .filter(Boolean)
    ));

    let clientNameByEmail = new Map<string, string>();

    if (attendeeEmails.length > 0) {
      const { data: clientRows } = await adminClient
        .from("client_programs")
        .select("client_email, client_name");

      clientNameByEmail = new Map(
        (clientRows || []).map((row) => [normalizeEmail(row.client_email), row.client_name as string])
      );
    }

    const sessions = trainingEvents.map((event) => {
      const startValue = event.start && typeof event.start === "object"
        ? (event.start as Record<string, unknown>)
        : {};
      const endValue = event.end && typeof event.end === "object"
        ? (event.end as Record<string, unknown>)
        : {};
      const attendeeEmail = firstNonCoachAttendeeEmail(event, coachEmail);
      const clientName = attendeeEmail ? clientNameByEmail.get(attendeeEmail) : "";

      return {
        summary: stringValue(event.summary),
        start: stringValue(startValue.dateTime) || stringValue(startValue.date),
        end: stringValue(endValue.dateTime) || stringValue(endValue.date),
        attendee_email: attendeeEmail || null,
        client_name: clientName || null
      };
    });

    return jsonResponse(request, { connected: true, sessions });
  }

  return jsonResponse(request, { error: "Unknown calendar action." }, 400);
});
