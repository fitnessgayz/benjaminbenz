import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://benjaminbenz.com",
  "https://www.benjaminbenz.com"
]);

function allowedOriginFor(request: Request) {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";

  if (allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
    return origin;
  }

  return "https://benjaminbenz.com";
}

function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOriginFor(request),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function fitbitErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const errors = Array.isArray(record.errors) ? record.errors : [];
  const firstError = errors[0];

  if (firstError && typeof firstError === "object") {
    return stringValue((firstError as Record<string, unknown>).message);
  }

  return stringValue(record.error_description) || stringValue(record.error);
}

function normalizeEmail(value: unknown) {
  return stringValue(value).toLowerCase();
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

async function codeChallenge(verifier: string) {
  const bytes = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(digest));
}

function fitbitEnv(request: Request) {
  const clientId = Deno.env.get("FITBIT_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("FITBIT_CLIENT_SECRET") || "";
  const redirectUri = Deno.env.get("FITBIT_REDIRECT_URI") || `${allowedOriginFor(request)}/client-dashboard.html`;

  return { clientId, clientSecret, redirectUri };
}

function tokenAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function tokenRequest(params: URLSearchParams, clientId: string, clientSecret: string) {
  return fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      "Authorization": tokenAuthHeader(clientId, clientSecret),
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
  const { clientId, clientSecret } = fitbitEnv(request);
  const clientEmail = normalizeEmail(connection.client_email);
  const refreshToken = stringValue(connection.refresh_token);

  if (!clientId || !clientSecret || !refreshToken || !clientEmail) {
    return { connection, error: "Fitbit sync is not configured yet." };
  }

  const response = await tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  }), clientId, clientSecret);

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { connection, error: fitbitErrorMessage(payload) || "Fitbit login expired. Reconnect Fitbit." };
  }

  const expiresIn = Number(payload.expires_in || 28800);
  const nextConnection = {
    client_email: clientEmail,
    fitbit_user_id: stringValue(payload.user_id) || stringValue(connection.fitbit_user_id),
    access_token: stringValue(payload.access_token),
    refresh_token: stringValue(payload.refresh_token) || refreshToken,
    scope: stringValue(payload.scope) || stringValue(connection.scope),
    expires_at: new Date(Date.now() + (expiresIn * 1000)).toISOString(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await adminClient
    .from("client_fitbit_connections")
    .upsert(nextConnection, { onConflict: "client_email" })
    .select("*")
    .single();

  if (error) {
    return { connection, error: "Could not refresh Fitbit login." };
  }

  return { connection: data, error: "" };
}

async function currentConnection(adminClient: ReturnType<typeof createClient>, email: string, request: Request) {
  const { data, error } = await adminClient
    .from("client_fitbit_connections")
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

function normalizedStartTime(value: unknown) {
  const text = stringValue(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : "12:00";
}

function normalizedDurationMillis(value: unknown) {
  const minutes = Number(value);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 360) : 45;
  return Math.round(safeMinutes * 60 * 1000);
}

async function createFitbitActivity(accessToken: string, body: Record<string, unknown>) {
  const activityName = stringValue(body.workoutTitle) || "Strength Training";
  const params = new URLSearchParams({
    activityName,
    date: normalizedWorkoutDate(body.entryDate),
    startTime: normalizedStartTime(body.startTime),
    durationMillis: String(normalizedDurationMillis(body.durationMinutes))
  });
  const calories = Number(body.calories);

  if (Number.isFinite(calories) && calories > 0) {
    params.set("manualCalories", String(Math.round(calories)));
  }

  return fetch("https://api.fitbit.com/1/user/-/activities.json", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
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
    return jsonResponse(request, { error: "Fitbit sync is missing Supabase secrets." }, 500);
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
    const { clientId, redirectUri } = fitbitEnv(request);

    if (!clientId) {
      return jsonResponse(request, { error: "Fitbit client ID is not configured yet." }, 500);
    }

    const codeVerifier = randomToken(64);
    const authorizationUrl = new URL("https://www.fitbit.com/oauth2/authorize");
    const state = randomToken(32);

    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", clientId);
    authorizationUrl.searchParams.set("redirect_uri", redirectUri);
    authorizationUrl.searchParams.set("scope", "activity profile");
    authorizationUrl.searchParams.set("code_challenge", await codeChallenge(codeVerifier));
    authorizationUrl.searchParams.set("code_challenge_method", "S256");
    authorizationUrl.searchParams.set("state", state);

    return jsonResponse(request, {
      authorizationUrl: authorizationUrl.toString(),
      codeVerifier,
      state
    });
  }

  if (action === "callback") {
    const { clientId, clientSecret, redirectUri } = fitbitEnv(request);
    const code = stringValue(safeBody.code);
    const codeVerifier = stringValue(safeBody.codeVerifier);

    if (!clientId || !clientSecret) {
      return jsonResponse(request, { error: "Fitbit credentials are not configured yet." }, 500);
    }

    if (!code || !codeVerifier) {
      return jsonResponse(request, { error: "Fitbit login is missing the authorization code." }, 400);
    }

    const response = await tokenRequest(new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    }), clientId, clientSecret);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonResponse(request, {
        error: fitbitErrorMessage(payload) || "Could not connect Fitbit."
      }, 400);
    }

    const expiresIn = Number(payload.expires_in || 28800);
    const { error } = await adminClient
      .from("client_fitbit_connections")
      .upsert({
        client_email: email,
        fitbit_user_id: stringValue(payload.user_id),
        access_token: stringValue(payload.access_token),
        refresh_token: stringValue(payload.refresh_token),
        scope: stringValue(payload.scope),
        expires_at: new Date(Date.now() + (expiresIn * 1000)).toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: "client_email" });

    if (error) {
      return jsonResponse(request, { error: "Could not save Fitbit connection." }, 500);
    }

    return jsonResponse(request, { connected: true });
  }

  if (action === "status") {
    const { connection, error } = await currentConnection(adminClient, email, request);

    if (error) {
      return jsonResponse(request, {
        connected: false,
        error
      }, 400);
    }

    return jsonResponse(request, {
      connected: Boolean(connection),
      fitbitUserId: connection ? stringValue(connection.fitbit_user_id) : "",
      expiresAt: connection ? stringValue(connection.expires_at) : ""
    });
  }

  if (action === "disconnect") {
    await adminClient
      .from("client_fitbit_connections")
      .delete()
      .eq("client_email", email);

    return jsonResponse(request, { connected: false });
  }

  if (action === "sync-workout") {
    const entryDate = normalizedWorkoutDate(safeBody.entryDate);
    const workoutTitle = stringValue(safeBody.workoutTitle) || "Strength Training";
    const { data: existingSync } = await adminClient
      .from("client_fitbit_activity_syncs")
      .select("fitbit_log_id")
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
      return jsonResponse(request, { synced: false, skipped: true, message: "Fitbit is not connected." });
    }

    let response = await createFitbitActivity(stringValue(connection.access_token), {
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
      response = await createFitbitActivity(stringValue(refreshedConnection.access_token), {
        ...safeBody,
        entryDate,
        workoutTitle
      });
    }

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonResponse(request, {
        error: fitbitErrorMessage(payload) || "Fitbit could not save this workout."
      }, 502);
    }

    const fitbitLogId = stringValue(payload.activityLog?.logId || payload.logId);
    const { error: insertError } = await adminClient
      .from("client_fitbit_activity_syncs")
      .insert({
        client_email: email,
        entry_date: entryDate,
        workout_title: workoutTitle,
        fitbit_log_id: fitbitLogId || null
      });

    if (insertError && insertError.code !== "23505") {
      return jsonResponse(request, { error: "Fitbit synced, but the sync record could not be saved." }, 500);
    }

    return jsonResponse(request, { synced: true, fitbitLogId });
  }

  return jsonResponse(request, { error: "Unknown Fitbit action." }, 400);
});
