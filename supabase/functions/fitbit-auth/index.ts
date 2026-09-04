import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { allowedOriginFor, corsHeaders, jsonResponse, normalizeEmail, stringValue } from "../_shared/http.ts";

const googleHealthScope = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.writeonly";

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

function googleHealthEnv(request: Request) {
  const clientId = Deno.env.get("GOOGLE_HEALTH_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("GOOGLE_HEALTH_CLIENT_SECRET") || "";
  const redirectUri = Deno.env.get("GOOGLE_HEALTH_REDIRECT_URI") || `${allowedOriginFor(request)}/client-dashboard.html`;

  return { clientId, clientSecret, redirectUri };
}

async function tokenRequest(params: URLSearchParams) {
  return fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });
}

async function getAuthenticatedEmail(request: Request, supabaseUrl: string, anonKey: string) {
  const authHeader = request.headers.get("Authorization") || "";

  if (!authHeader.startsWith("Bearer ")) {
    return { email: "", error: "Sign in first." };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } }
  });
  const { data, error } = await userClient.auth.getUser();
  const email = normalizeEmail(data.user?.email);

  if (error || !email) {
    return { email: "", error: "Could not verify login." };
  }

  return { email, error: "" };
}

async function refreshConnection(adminClient: ReturnType<typeof createClient>, connection: Record<string, unknown>, request: Request) {
  const { clientId, clientSecret } = googleHealthEnv(request);
  const clientEmail = normalizeEmail(connection.client_email);
  const refreshToken = stringValue(connection.refresh_token);

  if (!clientId || !clientSecret || !refreshToken || !clientEmail) {
    return { connection, error: "Google Health sync is not configured yet." };
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
      error: googleErrorMessage(payload) || "Google Health login expired. Reconnect Google Health."
    };
  }

  const expiresIn = Number(payload.expires_in || 3600);
  const nextConnection = {
    client_email: clientEmail,
    access_token: stringValue(payload.access_token),
    refresh_token: stringValue(payload.refresh_token) || refreshToken,
    scope: stringValue(payload.scope) || stringValue(connection.scope),
    token_type: stringValue(payload.token_type) || stringValue(connection.token_type) || "Bearer",
    expires_at: new Date(Date.now() + (expiresIn * 1000)).toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await adminClient
    .from("client_google_health_connections")
    .upsert(nextConnection, { onConflict: "client_email" })
    .select("*")
    .single();

  if (error) {
    return { connection, error: "Could not refresh Google Health login." };
  }

  return { connection: data, error: "" };
}

async function currentConnection(adminClient: ReturnType<typeof createClient>, email: string, request: Request) {
  const { data, error } = await adminClient
    .from("client_google_health_connections")
    .select("*")
    .eq("client_email", email)
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

function normalizedWorkoutDate(value: unknown) {
  const text = stringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function normalizedDurationSeconds(value: unknown) {
  const minutes = Number(value);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 360) : 45;
  return Math.max(60, Math.round(safeMinutes * 60));
}

function normalizedUtcOffsetSeconds(value: unknown) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds)) {
    return 0;
  }

  return Math.max(-64800, Math.min(64800, Math.round(seconds)));
}

function workoutInterval(body: Record<string, unknown>) {
  const durationSeconds = normalizedDurationSeconds(body.durationMinutes);
  const providedStart = Date.parse(stringValue(body.startTime));
  const startTime = Number.isFinite(providedStart)
    ? new Date(providedStart)
    : new Date(`${normalizedWorkoutDate(body.entryDate)}T12:00:00.000Z`);
  const endTime = new Date(startTime.getTime() + (durationSeconds * 1000));
  const utcOffset = `${normalizedUtcOffsetSeconds(body.utcOffsetSeconds)}s`;

  return {
    durationSeconds,
    interval: {
      startTime: startTime.toISOString(),
      startUtcOffset: utcOffset,
      endTime: endTime.toISOString(),
      endUtcOffset: utcOffset
    }
  };
}

async function createGoogleHealthWorkout(accessToken: string, body: Record<string, unknown>) {
  const workoutTitle = stringValue(body.workoutTitle) || "Strength Training";
  const { durationSeconds, interval } = workoutInterval(body);
  const calories = Number(body.calories);
  const metricsSummary: Record<string, unknown> = {};

  if (Number.isFinite(calories) && calories > 0) {
    metricsSummary.caloriesKcal = calories;
  }

  return fetch("https://health.googleapis.com/v4/users/me/dataTypes/exercise/dataPoints", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      dataSource: {
        recordingMethod: "MANUAL"
      },
      exercise: {
        interval,
        exerciseType: "OTHER",
        displayName: workoutTitle,
        activeDuration: `${durationSeconds}s`,
        metricsSummary
      }
    })
  });
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
    return jsonResponse(request, { error: "Google Health sync is missing Supabase secrets." }, 500);
  }

  const { email, error: authError } = await getAuthenticatedEmail(request, supabaseUrl, anonKey);

  if (authError || !email) {
    return jsonResponse(request, { error: authError || "Sign in first." }, 401);
  }

  const body = await request.json().catch(() => ({}));
  const safeBody = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const action = stringValue(safeBody.action);
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  if (action === "start") {
    const { clientId, redirectUri } = googleHealthEnv(request);

    if (!clientId) {
      return jsonResponse(request, { error: "Google Health client ID is not configured yet." }, 500);
    }

    const state = randomToken(32);
    const expiresAt = new Date(Date.now() + (10 * 60 * 1000)).toISOString();
    await adminClient
      .from("client_google_health_oauth_states")
      .delete()
      .eq("client_email", email);
    const { error: stateError } = await adminClient
      .from("client_google_health_oauth_states")
      .insert({ state, client_email: email, expires_at: expiresAt });

    if (stateError) {
      return jsonResponse(request, { error: "Could not begin Google Health login." }, 500);
    }

    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", googleHealthScope);
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("include_granted_scopes", "true");
    authorizationUrl.searchParams.set("prompt", "consent");
    authorizationUrl.searchParams.set("state", state);

    return jsonResponse(request, {
      authorizationUrl: authorizationUrl.toString(),
      state
    });
  }

  if (action === "callback") {
    const { clientId, clientSecret, redirectUri } = googleHealthEnv(request);
    const code = stringValue(safeBody.code);
    const state = stringValue(safeBody.state);

    if (!clientId || !clientSecret) {
      return jsonResponse(request, { error: "Google Health credentials are not configured yet." }, 500);
    }

    if (!code || !state) {
      return jsonResponse(request, { error: "Google Health login is missing required information." }, 400);
    }

    const { data: consumedState, error: stateError } = await adminClient
      .from("client_google_health_oauth_states")
      .delete()
      .eq("state", state)
      .eq("client_email", email)
      .gt("expires_at", new Date().toISOString())
      .select("state")
      .maybeSingle();

    if (stateError || !consumedState) {
      return jsonResponse(request, { error: "Google Health login could not be verified. Try connecting again." }, 400);
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
      return jsonResponse(request, {
        error: googleErrorMessage(payload) || "Could not connect Google Health."
      }, 400);
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
      .from("client_google_health_connections")
      .upsert({
        client_email: email,
        access_token: accessToken,
        refresh_token: refreshToken,
        scope: stringValue(payload.scope) || googleHealthScope,
        token_type: stringValue(payload.token_type) || "Bearer",
        expires_at: new Date(Date.now() + (expiresIn * 1000)).toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "client_email" });

    if (error) {
      return jsonResponse(request, { error: "Could not save Google Health connection." }, 500);
    }

    return jsonResponse(request, { connected: true });
  }

  if (action === "status") {
    const { connection, error } = await currentConnection(adminClient, email, request);

    if (error) {
      return jsonResponse(request, { connected: false, error }, 400);
    }

    return jsonResponse(request, {
      connected: Boolean(connection),
      expiresAt: connection ? stringValue(connection.expires_at) : ""
    });
  }

  if (action === "disconnect") {
    await Promise.all([
      adminClient.from("client_google_health_connections").delete().eq("client_email", email),
      adminClient.from("client_google_health_oauth_states").delete().eq("client_email", email)
    ]);

    return jsonResponse(request, { connected: false });
  }

  if (action === "sync-workout") {
    const entryDate = normalizedWorkoutDate(safeBody.entryDate);
    const workoutTitle = stringValue(safeBody.workoutTitle) || "Strength Training";
    const { data: existingSync } = await adminClient
      .from("client_google_health_activity_syncs")
      .select("google_health_data_point_name")
      .eq("client_email", email)
      .eq("entry_date", entryDate)
      .eq("workout_title", workoutTitle)
      .maybeSingle();

    if (existingSync) {
      return jsonResponse(request, { synced: true, alreadySynced: true });
    }

    const { connection, error: connectionError } = await currentConnection(adminClient, email, request);

    if (connectionError) {
      return jsonResponse(request, { error: connectionError }, 400);
    }

    if (!connection) {
      return jsonResponse(request, { synced: false, skipped: true, message: "Google Health is not connected." });
    }

    let response = await createGoogleHealthWorkout(stringValue(connection.access_token), {
      ...safeBody,
      entryDate,
      workoutTitle
    });

    if (response.status === 401) {
      const refreshed = await refreshConnection(adminClient, connection, request);

      if (refreshed.error) {
        return jsonResponse(request, { error: refreshed.error }, 400);
      }

      const refreshedConnection = refreshed.connection as Record<string, unknown>;
      response = await createGoogleHealthWorkout(stringValue(refreshedConnection.access_token), {
        ...safeBody,
        entryDate,
        workoutTitle
      });
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonResponse(request, {
        error: googleErrorMessage(payload) || "Google Health could not save this workout."
      }, 502);
    }

    const payloadRecord = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const responseRecord = payloadRecord.response && typeof payloadRecord.response === "object"
      ? payloadRecord.response as Record<string, unknown>
      : {};
    const dataPointName = stringValue(responseRecord.name) || stringValue(payloadRecord.name);
    const { error: insertError } = await adminClient
      .from("client_google_health_activity_syncs")
      .insert({
        client_email: email,
        entry_date: entryDate,
        workout_title: workoutTitle,
        google_health_data_point_name: dataPointName || null
      });

    if (insertError && insertError.code !== "23505") {
      return jsonResponse(request, {
        error: "Google Health synced, but the sync record could not be saved."
      }, 500);
    }

    return jsonResponse(request, { synced: true, dataPointName });
  }

  return jsonResponse(request, { error: "Unknown Google Health action." }, 400);
});
