import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.116.0";
import { GOOGLE_HEALTH_SCOPE, HealthError, textValue, objectValue, hasReadScope, syncWindow, fetchGoogleWorkouts, sha256Hex, constantTimeEqual } from "./google-health.ts";

type Database = SupabaseClient;
type Connection = Record<string, unknown>;
const allowedOrigins = new Set(["https://benjaminbenz.com", "https://www.benjaminbenz.com"]);

function allowedOriginFor(request: Request): string {
  const origin = request.headers.get("Origin") || "https://benjaminbenz.com";
  return allowedOrigins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin) ? origin : "https://benjaminbenz.com";
}

function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Origin": allowedOriginFor(request),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function configuration(request: Request) {
  return {
    clientId: textValue(Deno.env.get("GOOGLE_HEALTH_CLIENT_ID")),
    clientSecret: textValue(Deno.env.get("GOOGLE_HEALTH_CLIENT_SECRET")),
    redirectUri: textValue(Deno.env.get("GOOGLE_HEALTH_REDIRECT_URI")) || `${allowedOriginFor(request)}/client-dashboard.html`
  };
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "fwbgh_" + btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function validatedRedirect(request: Request, configuredUri: string): string {
  let redirect: URL;
  try { redirect = new URL(configuredUri); } catch (_) { throw new HealthError("Google Health's return address is not configured correctly.", "CONFIGURATION_ERROR", 503); }
  if (redirect.origin !== allowedOriginFor(request) || redirect.pathname !== "/client-dashboard.html" || redirect.search || redirect.hash) {
    throw new HealthError("Open FWB using its configured website address before connecting Google Health.", "REDIRECT_ORIGIN_MISMATCH", 409);
  }
  return redirect.toString();
}

async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try { return await fetch(url, { ...init, signal: AbortSignal.timeout(10000) }); }
  catch (_) { throw new HealthError("Google Health could not be reached. Please retry.", "PROVIDER_UNAVAILABLE"); }
}

async function tokenRequest(parameters: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await providerFetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: parameters.toString()
  });
  const payload = objectValue(await response.json().catch(() => ({})));
  if (!response.ok) {
    if (payload.error === "invalid_grant") throw new HealthError("Reconnect Google Health to restore workout access.", "RECONNECT_REQUIRED", 409, true);
    if (payload.error === "invalid_client" || payload.error === "unauthorized_client") throw new HealthError("Google Health is not configured correctly. Please contact your coach.", "CONFIGURATION_ERROR", 503);
    throw new HealthError("Google Health could not authorize access. Please try connecting again.", "TOKEN_EXCHANGE_FAILED");
  }
  if (!textValue(payload.access_token)) throw new HealthError("Google Health did not provide access. Please reconnect.", "INVALID_TOKEN_RESPONSE", 409, true);
  return payload;
}

function tokenFields(payload: Record<string, unknown>, previous: Connection = {}): Connection {
  const seconds = Number(payload.expires_in);
  return {
    access_token: textValue(payload.access_token),
    refresh_token: textValue(payload.refresh_token) || textValue(previous.refresh_token),
    scope: textValue(payload.scope) || textValue(previous.scope),
    token_type: "Bearer",
    expires_at: new Date(Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 86400) : 3600) * 1000).toISOString()
  };
}

async function authenticatedUser(request: Request, url: string, anonKey: string) {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new HealthError("Sign in first.", "SIGN_IN_REQUIRED", 401);
  const client = createClient(url, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });
  const { data, error } = await client.auth.getUser();
  const email = textValue(data.user?.email).toLowerCase();
  const id = textValue(data.user?.id);
  if (error || !email || !id) throw new HealthError("Your sign-in expired. Sign in again.", "SIGN_IN_REQUIRED", 401);
  return { email, id };
}

async function requireActiveClient(database: Database, email: string) {
  const { data, error } = await database.from("client_programs").select("id").eq("client_email", email).eq("active", true).or("client_archived.is.null,client_archived.eq.false").limit(1);
  if (error) throw new HealthError("Could not verify your client account. Please retry.", "DATABASE_ERROR", 503);
  if (!data?.length) throw new HealthError("Google Health sync requires an active client account.", "INACTIVE_CLIENT", 403);
}

async function readConnection(database: Database, email: string, ownerId: string): Promise<Connection | null> {
  const { data, error } = await database.from("client_google_health_connections").select("*").eq("client_email", email).eq("owner_user_id", ownerId).maybeSingle();
  if (error) throw new HealthError("Could not load Google Health settings. Please retry.", "DATABASE_ERROR", 503);
  return data;
}

function connectionStatus(connection: Connection | null, configured: boolean) {
  return {
    configured,
    connected: Boolean(connection),
    autoSync: Boolean(connection?.auto_sync_enabled),
    lastSyncedAt: textValue(connection?.last_synced_at) || null,
    // Only our own sanitized messages are persisted by this implementation.
    lastSyncError: connection?.last_sync_error ? "The last sync could not finish. Try Sync now or reconnect Google Health." : null,
    needsReconnect: Boolean(connection && (connection.needs_reconnect || !hasReadScope(connection.scope)))
  };
}

async function refreshForLease(database: Database, connection: Connection, leaseId: string, config: ReturnType<typeof configuration>): Promise<Connection> {
  const payload = await tokenRequest(new URLSearchParams({
    client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token", refresh_token: textValue(connection.refresh_token)
  }));
  const fields = tokenFields(payload, connection);
  if (!hasReadScope(fields.scope)) throw new HealthError("Reconnect Google Health to allow workout access.", "RECONNECT_REQUIRED", 409, true);
  const { data, error } = await database.from("client_google_health_connections")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("client_email", connection.client_email).eq("connection_id", connection.connection_id).eq("sync_lease_id", leaseId)
    .select("connection_id").maybeSingle();
  if (error) throw new HealthError("Could not save the refreshed connection. Please retry.", "DATABASE_ERROR", 503);
  if (!data) throw new HealthError("Google Health settings changed during sync. Please retry.", "SYNC_CANCELLED", 409);
  return { ...connection, ...fields };
}

async function runSync(database: Database, initialConnection: Connection, config: ReturnType<typeof configuration>, manual: boolean, deadline = Date.now() + 55000) {
  const email = textValue(initialConnection.client_email);
  const { data: leaseId, error: claimError } = await database.rpc("claim_google_health_sync", {
    target_email: email, target_connection_id: initialConnection.connection_id, p_manual: manual
  });
  if (claimError) throw new HealthError("Could not begin Google Health sync. Please retry.", "DATABASE_ERROR", 503);
  if (!leaseId) throw new HealthError("A sync is running or your Google Health settings changed. Please retry shortly.", "SYNC_BUSY", 409);
  let connection = initialConnection;
  try {
    if (!hasReadScope(connection.scope) || connection.needs_reconnect) throw new HealthError("Reconnect Google Health to allow workout access.", "RECONNECT_REQUIRED", 409, true);
    const expires = Date.parse(textValue(connection.expires_at));
    if (!Number.isFinite(expires) || expires <= Date.now() + 60000) connection = await refreshForLease(database, connection, String(leaseId), config);
    let retried401 = false;
    const window = syncWindow();
    const workouts = await fetchGoogleWorkouts(async (url: string) => {
      let response = await providerFetch(url, { headers: { Authorization: `Bearer ${textValue(connection.access_token)}` } });
      if (response.status === 401 && !retried401) {
        retried401 = true;
        connection = await refreshForLease(database, connection, String(leaseId), config);
        response = await providerFetch(url, { headers: { Authorization: `Bearer ${textValue(connection.access_token)}` } });
      }
      return response;
    }, window, config.clientId, deadline);
    // Upsert only: reconnecting another Google account must preserve history.
    const { data, error } = await database.rpc("commit_google_health_sync", {
      target_email: email, target_connection_id: initialConnection.connection_id, target_lease_id: leaseId,
      workouts
    });
    if (error) throw new HealthError("Could not save Google Health workouts. Please retry.", "DATABASE_ERROR", 503);
    const result = objectValue(data);
    if (!result.committed) throw new HealthError("Google Health settings changed during sync. No workouts were changed.", "SYNC_CANCELLED", 409);
    return { connected: true, imported: Number(result.imported || 0), updated: Number(result.updated || 0), deleted: Number(result.deleted || 0), lastSyncedAt: new Date().toISOString() };
  } catch (failure) {
    const error = failure instanceof HealthError ? failure : new HealthError("Google Health sync could not finish. Please retry.");
    // Conditional update cannot resurrect a disconnected or replaced connection.
    const { error: recordError } = await database.from("client_google_health_connections").update({
      last_sync_error: error.message, needs_reconnect: error.reconnect,
      sync_lease_id: null, sync_lease_expires_at: null, sync_lease_manual: false
    }).eq("client_email", email).eq("connection_id", initialConnection.connection_id).eq("sync_lease_id", leaseId);
    if (recordError) throw new HealthError("Google Health sync could not finish or save its status. Please retry.", "DATABASE_ERROR", 503);
    throw error;
  }
}

async function scheduledSync(request: Request, database: Database, config: ReturnType<typeof configuration>) {
  const secret = request.headers.get("X-FWB-Health-Sync-Secret") || "";
  if (secret.length < 32 || secret.length > 512) throw new HealthError("Not authorized.", "UNAUTHORIZED", 401);
  const { data: settings, error: settingsError } = await database.from("google_health_sync_config").select("secret_hash").eq("id", 1).maybeSingle();
  if (settingsError) throw new HealthError("The scheduled sync is unavailable.", "DATABASE_ERROR", 503);
  if (!/^[a-f0-9]{64}$/.test(textValue(settings?.secret_hash)) || !constantTimeEqual(await sha256Hex(secret), textValue(settings?.secret_hash))) throw new HealthError("Not authorized.", "UNAUTHORIZED", 401);
  if (!config.clientId || !config.clientSecret) throw new HealthError("Google Health is not configured yet.", "NOT_CONFIGURED", 503);
  const { data: activeClients, error: clientsError } = await database.from("client_programs").select("client_email").eq("active", true).or("client_archived.is.null,client_archived.eq.false").limit(1000);
  if (clientsError) throw new HealthError("Could not load active clients.", "DATABASE_ERROR", 503);
  const emails = [...new Set((activeClients || []).map((client: Record<string, unknown>) => textValue(client.client_email).toLowerCase()).filter(Boolean))];
  if (!emails.length) return { processed: 0, succeeded: 0, failed: 0 };
  const { data: connections, error } = await database.from("client_google_health_connections").select("*")
    .eq("auto_sync_enabled", true).eq("needs_reconnect", false).not("owner_user_id", "is", null).in("client_email", emails)
    // The cron runs every 15 minutes. Two minutes of grace cover its 100-second
    // worker budget and scheduling jitter without skipping alternate ticks.
    .or(`last_sync_attempt_at.is.null,last_sync_attempt_at.lte.${new Date(Date.now() - 13 * 60000).toISOString()}`)
    .order("last_sync_attempt_at", { ascending: true, nullsFirst: true }).order("client_email", { ascending: true }).limit(50);
  if (error) throw new HealthError("Could not load scheduled connections.", "DATABASE_ERROR", 503);
  let processed = 0, succeeded = 0, failed = 0;
  let next = 0;
  const deadline = Date.now() + 100000;
  const queue = connections || [];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (next < queue.length && Date.now() < deadline) {
      const connection = queue[next++];
      processed++;
      try { await runSync(database, connection, config, false, Math.min(deadline, Date.now() + 55000)); succeeded++; }
      catch (_) { failed++; }
    }
  }));
  return { processed, succeeded, failed };
}

async function handleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse(request, { error: "Use POST." }, 405);
  try {
    const supabaseUrl = textValue(Deno.env.get("SUPABASE_URL"));
    const anonKey = textValue(Deno.env.get("SUPABASE_ANON_KEY"));
    const serviceRoleKey = textValue(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new HealthError("Google Health is unavailable.", "NOT_CONFIGURED", 503);
    const body = objectValue(await request.json().catch(() => ({})));
    const action = textValue(body.action);
    const database = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const config = configuration(request);
    const configured = Boolean(config.clientId && config.clientSecret);
    if (action === "sync-all") return jsonResponse(request, await scheduledSync(request, database, config));
    const user = await authenticatedUser(request, supabaseUrl, anonKey);

    if (action === "status") return jsonResponse(request, connectionStatus(await readConnection(database, user.email, user.id), configured));

    if (action === "disconnect") {
      const connection = await readConnection(database, user.email, user.id);
      const { error } = await database.rpc("disconnect_google_health", { target_email: user.email, target_owner_user_id: user.id });
      if (error) throw new HealthError("Could not disconnect Google Health. Please retry.", "DATABASE_ERROR", 503);
      const token = textValue(connection?.refresh_token) || textValue(connection?.access_token);
      let revocationPending = false;
      if (token) {
        try {
          const response = await providerFetch("https://oauth2.googleapis.com/revoke", {
            method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString()
          });
          revocationPending = !response.ok && response.status !== 400;
        } catch (_) { revocationPending = true; }
      }
      return jsonResponse(request, { connected: false, autoSync: false, revocationPending });
    }

    if (action === "set-auto-sync") {
      if (typeof body.enabled !== "boolean") throw new HealthError("Choose whether automatic sync is enabled.", "INVALID_SETTING", 400);
      const connection = await readConnection(database, user.email, user.id);
      if (!connection) throw new HealthError("Connect Google Health first.", "NOT_CONNECTED", 409);
      if (body.enabled) {
        await requireActiveClient(database, user.email);
        if (connection.needs_reconnect || !hasReadScope(connection.scope)) throw new HealthError("Reconnect Google Health first.", "RECONNECT_REQUIRED", 409, true);
      }
      const { data, error } = await database.from("client_google_health_connections").update({
        auto_sync_enabled: body.enabled, sync_lease_id: null, sync_lease_expires_at: null, sync_lease_manual: false, updated_at: new Date().toISOString()
      }).eq("client_email", user.email).eq("owner_user_id", user.id).eq("connection_id", connection.connection_id).select("*").maybeSingle();
      if (error) throw new HealthError("Could not save your Google Health setting.", "DATABASE_ERROR", 503);
      if (!data) throw new HealthError("Google Health settings changed. Please retry.", "SYNC_CANCELLED", 409);
      return jsonResponse(request, connectionStatus(data, configured));
    }

    if (!configured) throw new HealthError("Google Health is not configured yet.", "NOT_CONFIGURED", 503);
    await requireActiveClient(database, user.email);
    if (action === "start") {
      const redirectUri = validatedRedirect(request, config.redirectUri);
      const state = randomState();
      const { error: cleanupError } = await database.from("client_google_health_oauth_states").delete().eq("client_email", user.email);
      if (cleanupError) throw new HealthError("Could not begin Google Health login.", "DATABASE_ERROR", 503);
      const { error } = await database.from("client_google_health_oauth_states").insert({
        state, client_email: user.email, owner_user_id: user.id, redirect_uri: redirectUri, expires_at: new Date(Date.now() + 600000).toISOString()
      });
      if (error) throw new HealthError("Could not begin Google Health login.", "DATABASE_ERROR", 503);
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      for (const [key, value] of Object.entries({ response_type: "code", client_id: config.clientId, redirect_uri: redirectUri,
        scope: GOOGLE_HEALTH_SCOPE, access_type: "offline", prompt: "consent", state })) url.searchParams.set(key, value);
      return jsonResponse(request, { authorizationUrl: url.toString(), state });
    }

    if (action === "callback") {
      const state = textValue(body.state), code = textValue(body.code);
      if (!/^fwbgh_[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 4096) throw new HealthError("Google Health login could not be verified. Connect again.", "INVALID_OAUTH_STATE", 400);
      const { data: pending, error } = await database.from("client_google_health_oauth_states").select("state,redirect_uri")
        .eq("state", state).eq("client_email", user.email).eq("owner_user_id", user.id).gt("expires_at", new Date().toISOString()).maybeSingle();
      if (error) throw new HealthError("Could not verify Google Health login.", "DATABASE_ERROR", 503);
      if (!pending) throw new HealthError("Google Health login expired or was cancelled. Connect again.", "INVALID_OAUTH_STATE", 400);
      const payload = await tokenRequest(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
        grant_type: "authorization_code", code, redirect_uri: textValue(pending.redirect_uri) }));
      const fields = tokenFields(payload);
      if (!hasReadScope(fields.scope) || !textValue(fields.refresh_token)) throw new HealthError("Approve workout access when reconnecting Google Health.", "RECONNECT_REQUIRED", 409, true);
      const { data: completed, error: finishError } = await database.rpc("finish_google_health_connection", {
        target_email: user.email, target_owner_user_id: user.id, target_state: state, token_data: fields
      });
      if (finishError) throw new HealthError("Could not save Google Health connection. Connect again.", "DATABASE_ERROR", 503);
      if (!completed) throw new HealthError("Google Health login expired or was cancelled. Connect again.", "INVALID_OAUTH_STATE", 409);
      return jsonResponse(request, { connected: true, autoSync: true });
    }

    if (action === "sync") {
      const connection = await readConnection(database, user.email, user.id);
      if (!connection) throw new HealthError("Connect Google Health first.", "NOT_CONNECTED", 409);
      return jsonResponse(request, await runSync(database, connection, config, true));
    }
    throw new HealthError("Unknown Google Health action.", "INVALID_ACTION", 400);
  } catch (failure) {
    const error = failure instanceof HealthError ? failure : new HealthError("Google Health is temporarily unavailable. Please retry.", "INTERNAL_ERROR", 500);
    return jsonResponse(request, { error: error.message, code: error.code }, error.status);
  }
}

Deno.serve(handleRequest);
