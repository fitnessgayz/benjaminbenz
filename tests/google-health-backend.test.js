const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto, createHash } = require("node:crypto");
const { stripTypeScriptTypes } = require("node:module");

const directory = path.join(__dirname, "../supabase/functions/fitbit-auth");
const helpers = stripTypeScriptTypes(fs.readFileSync(path.join(directory, "google-health.ts"), "utf8").replace(/^export /gm, ""));
const handler = stripTypeScriptTypes(fs.readFileSync(path.join(directory, "index.ts"), "utf8").replace(/^import .+;\n/gm, "").replace(/\nDeno.serve\(handleRequest\);/, ""));
const scope = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "client@example.com" };
const generation = "22222222-2222-4222-8222-222222222222";
const state = "fwbgh_" + "a".repeat(43);
const secret = "test-scheduled-secret-at-least-32-characters";
const sample = (id = "one", date = new Date().toISOString().slice(0, 10)) => ({
  name: `users/123456/dataTypes/exercise/dataPoints/${id}`,
  exercise: {
    interval: { startTime: `${date}T13:00:00Z`, endTime: `${date}T13:50:00Z`, startUtcOffset: "-25200s", endUtcOffset: "-25200s" },
    exerciseType: "WEIGHTLIFTING", displayName: "Weight lifting", activeDuration: "2700s",
    metricsSummary: { caloriesKcal: 320, distanceMillimeters: 1234000, averageHeartRateBeatsPerMinute: "114" }
  }
});

function fixture(options = {}) {
  const calls = { auth: 0, queries: [], rpc: [], provider: [] };
  const connection = {
    client_email: user.email, owner_user_id: user.id, connection_id: generation,
    access_token: "private-access", refresh_token: "private-refresh", scope,
    expires_at: new Date(Date.now() + 3600000).toISOString(), auto_sync_enabled: true,
    needs_reconnect: false, ...options.connection
  };
  const rows = {
    client_programs: options.inactive ? [] : [{ id: "program", client_email: user.email, active: true, client_archived: options.archivedNull ? null : false }],
    client_google_health_connections: options.noConnection ? [] : [connection, ...(options.extraConnections || [])],
    client_google_health_oauth_states: options.noState ? [] : [{ state, client_email: user.email, owner_user_id: user.id,
      expires_at: new Date(Date.now() + 600000).toISOString(), redirect_uri: "https://benjaminbenz.com/client-dashboard.html" }],
    google_health_sync_config: [{ id: 1, secret_hash: createHash("sha256").update(secret).digest("hex") }]
  };
  for (const extra of options.extraConnections || []) rows.client_programs.push({ id: extra.client_email, client_email: extra.client_email, active: true, client_archived: false });
  let lease = null;
  let committed = [];
  const database = {
    from(table) {
      const operation = { table, action: "select", filters: [], orders: [] };
      const query = {
        select(columns) { operation.columns = columns; return query; },
        update(value) { operation.action = "update"; operation.value = value; return query; },
        insert(value) { operation.action = "insert"; operation.value = value; return query; },
        delete() { operation.action = "delete"; return query; },
        eq(column, value) { operation.filters.push(["eq", column, value]); return query; },
        gt(column, value) { operation.filters.push(["gt", column, value]); return query; },
        not(column, operator, value) { operation.filters.push(["not", column, value]); return query; },
        in(column, value) { operation.filters.push(["in", column, value]); return query; },
        or(expression) { operation.filters.push(["or", "", expression]); return query; },
        order(column, ordering) { operation.orders.push([column, ordering]); return query; },
        limit(count) { operation.limit = count; return query; },
        maybeSingle() { operation.single = true; return query; },
        then(resolve, reject) {
          calls.queries.push(operation);
          if (options.queryError?.(operation)) return Promise.resolve({ data: null, error: { message: "private database error" } }).then(resolve, reject);
          const matches = (row) => operation.filters.every(([operator, column, value]) => {
            if (operator === "or") return value.split(",").some((part) => {
              const [key, comparison, ...rest] = part.split(".");
              const match = rest.join(".");
              if (comparison === "is") return row[key] == null;
              if (comparison === "eq") return row[key] === false && match === "false";
              return row[key] != null && row[key] <= match;
            });
            if (operator === "eq") return row[column] === value;
            if (operator === "gt") return row[column] > value;
            if (operator === "not") return row[column] != value;
            return value.includes(row[column]);
          });
          let selected = (rows[table] || []).filter(matches);
          if (operation.limit) selected = selected.slice(0, operation.limit);
          if (operation.action === "insert") { rows[table].push(operation.value); selected = [operation.value]; }
          if (operation.action === "update") selected.forEach((row) => Object.assign(row, operation.value));
          if (operation.action === "delete") rows[table] = rows[table].filter((row) => !matches(row));
          return Promise.resolve({ data: operation.single ? selected[0] || null : selected, error: null }).then(resolve, reject);
        }
      };
      return query;
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (options.rpcError === name) return { data: null, error: { message: "private rpc error" } };
      if (name === "claim_google_health_sync") {
        const target = rows.client_google_health_connections.find((row) => row.client_email === args.target_email);
        if (options.busy || (!args.p_manual && !target.auto_sync_enabled)) return { data: null, error: null };
        lease = "33333333-3333-4333-8333-333333333333";
        target.sync_lease_id = lease;
        return { data: lease, error: null };
      }
      if (name === "commit_google_health_sync") {
        const target = rows.client_google_health_connections.find((row) => row.client_email === args.target_email);
        if (options.cancelAtCommit || !target || target.sync_lease_id !== args.target_lease_id) return { data: { committed: false }, error: null };
        const imported = args.workouts.filter((row) => !committed.find((old) => old.source_name === row.source_name)).length;
        committed = args.workouts;
        target.sync_lease_id = null;
        return { data: { committed: true, imported, updated: args.workouts.length - imported, deleted: 0 }, error: null };
      }
      if (name === "finish_google_health_connection") {
        if (options.cancelCallback) return { data: false, error: null };
        const matching = rows.client_google_health_oauth_states.find((row) => row.state === args.target_state && row.owner_user_id === args.target_owner_user_id);
        rows.client_google_health_oauth_states = [];
        return { data: Boolean(matching), error: null };
      }
      if (name === "disconnect_google_health") {
        rows.client_google_health_connections = []; rows.client_google_health_oauth_states = [];
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }
  };
  const env = { SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service",
    GOOGLE_HEALTH_CLIENT_ID: "google-client", GOOGLE_HEALTH_CLIENT_SECRET: "google-secret", ...options.env };
  const context = vm.createContext({
    Request, Response, URL, URLSearchParams, Uint8Array, TextEncoder, AbortSignal, Date, Set, Map, crypto: webcrypto, btoa,
    Deno: { env: { get: (key) => env[key] } },
    createClient: (_url, key) => key === "anon" ? { auth: { getUser: async () => {
      calls.auth++;
      return { data: { user: options.unauthorized ? null : user }, error: null };
    } } } : database,
    fetch: async (url, init) => {
      calls.provider.push({ url, init });
      if (options.provider) return options.provider(url, init, calls, rows);
      if (url.endsWith("/token")) return new Response(JSON.stringify({ access_token: "new-private-access", refresh_token: "new-private-refresh", expires_in: 3600, scope }));
      if (url.endsWith("/revoke")) return new Response("{}");
      return new Response(JSON.stringify({ dataPoints: [sample()] }));
    }
  });
  vm.runInContext(helpers + "\n" + handler, context);
  return { calls, context, rows, connection, get committed() { return committed; } };
}

function request(action, values = {}, headers = {}) {
  return new Request("https://test.supabase.co/functions/v1/fitbit-auth", {
    method: "POST", headers: { Authorization: "Bearer client-session", Origin: "https://benjaminbenz.com", "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ action, ...values })
  });
}

test("mapper preserves total calories, local date, numeric-string heart rate, missing metrics and elapsed time", () => {
  const h = fixture();
  const source = sample("zero", "2026-09-24");
  source.exercise.interval.startTime = "2026-09-24T01:00:00Z";
  source.exercise.interval.endTime = "2026-09-24T01:50:00Z";
  const record = h.context.normalizeGoogleExercise(source);
  assert.equal(record.workout_date, "2026-09-23");
  assert.equal(record.calories, 320);
  assert.equal(record.active_calories, undefined);
  assert.equal(record.duration_seconds, 2700);
  assert.equal(record.elapsed_seconds, 3000);
  assert.equal(record.distance_meters, 1234);
  assert.equal(record.average_heart_rate, 114);
  source.exercise.metricsSummary = { caloriesKcal: 0, averageHeartRateBeatsPerMinute: "", distanceMillimeters: null };
  const missing = h.context.normalizeGoogleExercise(source);
  assert.equal(missing.calories, 0);
  assert.equal(missing.average_heart_rate, null);
  assert.equal(missing.distance_meters, null);
  assert.throws(() => h.context.normalizeGoogleExercise({ ...source, name: "https://foreign.example/workout" }), /invalid workout/);
});

test("pagination is complete, bounded, deduplicated, and excludes this app's historical exports", async () => {
  const h = fixture();
  const urls = [];
  const own = sample("outbound", "2026-09-24");
  own.dataSource = { application: { googleWebClientId: "google-client" } };
  const result = await h.context.fetchGoogleWorkouts(async (url) => {
    urls.push(new URL(url));
    return new Response(JSON.stringify(urls.length === 1 ? { dataPoints: [sample("one", "2026-09-24"), own], nextPageToken: "next" } : { dataPoints: [sample("one", "2026-09-24"), sample("two", "2026-09-24")] }));
  }, { startDate: "2026-09-01", endDate: "2026-10-01" }, "google-client");
  assert.equal(result.length, 2);
  assert.equal(urls[0].searchParams.get("pageSize"), "25");
  assert.match(urls[0].searchParams.get("filter"), /exercise.interval.civil_start_time/);
  assert.equal(urls[1].searchParams.get("pageToken"), "next");
  await assert.rejects(h.context.fetchGoogleWorkouts(async () => new Response(JSON.stringify({ nextPageToken: "loop" })), { startDate: "2026-09-01", endDate: "2026-10-01" }), /pagination did not complete/);
});

test("all client actions require a verified Supabase user and never use supplied email", async () => {
  for (const action of ["status", "start", "callback", "sync", "disconnect", "set-auto-sync"]) {
    const h = fixture({ unauthorized: true });
    const response = await h.context.handleRequest(request(action, { client_email: "victim@example.com" }));
    assert.equal(response.status, 401);
    assert.equal(h.calls.provider.length, 0);
    assert.equal(h.calls.rpc.length, 0);
  }
  const h = fixture();
  await h.context.handleRequest(request("status", { client_email: "victim@example.com" }));
  assert.ok(h.calls.queries[0].filters.some((filter) => filter[1] === "client_email" && filter[2] === user.email));
  assert.ok(h.calls.queries[0].filters.some((filter) => filter[1] === "owner_user_id" && filter[2] === user.id));
});

test("status is truthful about missing configuration and never returns secrets or raw provider errors", async () => {
  const h = fixture({ env: { GOOGLE_HEALTH_CLIENT_SECRET: "" }, connection: { last_sync_error: "private-access private-refresh" } });
  const response = await h.context.handleRequest(request("status"));
  const body = await response.json();
  assert.equal(body.configured, false);
  assert.equal(body.connected, true);
  assert.equal(body.autoSync, true);
  assert.equal(body.needsReconnect, false);
  assert.doesNotMatch(JSON.stringify(body), /private-|google-secret/);
  assert.equal(h.calls.provider.length, 0);
});

test("start persists a user-bound expiring fwbgh state and requests readonly offline access", async () => {
  const h = fixture();
  const response = await h.context.handleRequest(request("start", { redirectUri: "https://attacker.example", client_email: "victim@example.com" }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.state, /^fwbgh_[A-Za-z0-9_-]{43}$/);
  const url = new URL(body.authorizationUrl);
  assert.equal(url.searchParams.get("scope"), scope);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("redirect_uri"), "https://benjaminbenz.com/client-dashboard.html");
  const saved = h.rows.client_google_health_oauth_states[0];
  assert.equal(saved.owner_user_id, user.id);
  assert.equal(saved.client_email, user.email);
  assert.equal(saved.state, body.state);
});

test("callback rejects missing, expired, other-user, and cancelled states before or at atomic finalize", async () => {
  for (const options of [{ noState: true }, { cancelCallback: true }]) {
    const h = fixture(options);
    const response = await h.context.handleRequest(request("callback", { state, code: "provider-code" }));
    assert.ok([400, 409].includes(response.status));
    if (options.noState) assert.equal(h.calls.provider.length, 0);
  }
  const h = fixture();
  h.rows.client_google_health_oauth_states[0].owner_user_id = "another-user";
  assert.equal((await h.context.handleRequest(request("callback", { state, code: "provider-code" }))).status, 400);
  assert.equal(h.calls.provider.length, 0);
});

test("callback stores tokens only through one-use atomic finalize and returns no credentials", async () => {
  const h = fixture();
  const response = await h.context.handleRequest(request("callback", { state, code: "provider-code" }));
  assert.deepEqual(await response.json(), { connected: true, autoSync: true });
  const finish = h.calls.rpc.find((call) => call.name === "finish_google_health_connection");
  assert.equal(finish.args.target_owner_user_id, user.id);
  assert.equal(finish.args.token_data.scope, scope);
  assert.equal(h.calls.provider.length, 1);
  assert.equal((await h.context.handleRequest(request("callback", { state, code: "provider-code" }))).status, 400);
});

test("manual sync works paused, refreshes only as needed, and imports a complete source-keyed batch", async () => {
  const h = fixture({ connection: { auto_sync_enabled: false, expires_at: "2000-01-01T00:00:00Z" } });
  const response = await h.context.handleRequest(request("sync"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).imported, 1);
  assert.equal(h.calls.rpc[0].args.p_manual, true);
  assert.equal(h.calls.provider.filter((call) => call.url.endsWith("/token")).length, 1);
  const commit = h.calls.rpc.find((call) => call.name === "commit_google_health_sync");
  assert.equal(commit.args.workouts[0].calories, 320);
  assert.equal(commit.args.window_start, undefined);
  assert.equal(commit.args.window_end, undefined);
  assert.ok(h.calls.queries.find((query) => query.action === "update").filters.some((filter) => filter[1] === "sync_lease_id"));
});

test("one 401 retry refreshes access, but repeated unauthorized pages require reconnection", async () => {
  let exerciseCalls = 0;
  const h = fixture({ provider: async (url) => {
    if (url.endsWith("/token")) return new Response(JSON.stringify({ access_token: "rotated", expires_in: 3600, scope }));
    exerciseCalls++;
    return new Response(JSON.stringify({ error: "private-provider-error" }), { status: 401 });
  } });
  const response = await h.context.handleRequest(request("sync"));
  assert.equal(response.status, 409);
  assert.equal(exerciseCalls, 2);
  assert.equal(h.calls.provider.filter((call) => call.url.endsWith("/token")).length, 1);
  assert.equal(h.connection.needs_reconnect, true);
  assert.equal(h.connection.refresh_token, "private-refresh");
  assert.doesNotMatch(await response.text(), /private-/);
  assert.equal(h.calls.rpc.filter((call) => call.name === "commit_google_health_sync").length, 0);
});

test("failure on a later page never commits a partial import or deletes existing workouts", async () => {
  let page = 0;
  const h = fixture({ provider: async () => ++page === 1
    ? new Response(JSON.stringify({ dataPoints: [sample()], nextPageToken: "next" }))
    : new Response(JSON.stringify({ error: "upstream secret" }), { status: 500 }) });
  const response = await h.context.handleRequest(request("sync"));
  assert.equal(response.status, 502);
  assert.equal(h.calls.rpc.filter((call) => call.name === "commit_google_health_sync").length, 0);
  assert.equal(h.connection.sync_lease_id, null);
  assert.doesNotMatch(h.connection.last_sync_error, /upstream secret/);
});

test("pause invalidates an in-flight lease and atomic commit cancellation is not reported as success", async () => {
  const h = fixture({ cancelAtCommit: true });
  const response = await h.context.handleRequest(request("sync"));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "SYNC_CANCELLED");
  const paused = await h.context.handleRequest(request("set-auto-sync", { enabled: false }));
  assert.equal(paused.status, 200);
  assert.equal(h.connection.auto_sync_enabled, false);
  assert.equal(h.connection.sync_lease_id, null);
  assert.equal(h.connection.sync_lease_manual, false);
});

test("inactive clients cannot connect or sync but may still disconnect", async () => {
  const h = fixture({ inactive: true });
  assert.equal((await h.context.handleRequest(request("start"))).status, 403);
  assert.equal((await h.context.handleRequest(request("sync"))).status, 403);
  const response = await h.context.handleRequest(request("disconnect"));
  assert.equal(response.status, 200);
  assert.equal(h.rows.client_google_health_connections.length, 0);
  assert.equal(h.calls.provider[0].url, "https://oauth2.googleapis.com/revoke");
});

test("disconnect checks database errors and never revokes before local cancellation succeeds", async () => {
  const h = fixture({ rpcError: "disconnect_google_health" });
  assert.equal((await h.context.handleRequest(request("disconnect"))).status, 503);
  assert.equal(h.calls.provider.length, 0);
  assert.equal(h.rows.client_google_health_connections.length, 1);
});

test("scheduled sync requires the hashed cron secret, ignores a user token, and uses fair bounded automatic claims", async () => {
  const h = fixture();
  assert.equal((await h.context.handleRequest(request("sync-all"))).status, 401);
  assert.equal((await h.context.handleRequest(request("sync-all", {}, { "X-FWB-Health-Sync-Secret": "x".repeat(40) }))).status, 401);
  assert.equal(h.calls.rpc.length, 0);
  const response = await h.context.handleRequest(request("sync-all", {}, { "X-FWB-Health-Sync-Secret": secret, Authorization: "" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { processed: 1, succeeded: 1, failed: 0 });
  assert.equal(h.calls.auth, 0);
  assert.equal(h.calls.rpc[0].args.p_manual, false);
  const selection = h.calls.queries.find((query) => query.table === "client_google_health_connections" && query.orders.length);
  assert.equal(selection.limit, 50);
  assert.equal(selection.orders[0][0], "last_sync_attempt_at");
  assert.ok(selection.filters.some((filter) => filter[1] === "auto_sync_enabled" && filter[2] === true));
  const due = selection.filters.find((filter) => filter[0] === "or")[2].split("last_sync_attempt_at.lte.")[1];
  assert.ok(Math.abs(Date.now() - Date.parse(due) - 13 * 60000) < 5000, "13-minute due cutoff leaves scheduling grace for a 15-minute cron");
});

test("malformed provider objects and pagination tokens never become a successful empty snapshot", async () => {
  for (const payload of [null, false, [], "invalid", { error: { message: "secret" } }, { dataPoints: {}, nextPageToken: "" }, { dataPoints: [sample()], nextPageToken: 123 }]) {
    const h = fixture({ provider: async () => new Response(JSON.stringify(payload)) });
    const response = await h.context.handleRequest(request("sync"));
    assert.equal(response.status, 502);
    assert.equal(h.calls.rpc.filter((call) => call.name === "commit_google_health_sync").length, 0);
  }
  const validEmpty = fixture({ provider: async () => new Response("{}") });
  assert.equal((await validEmpty.context.handleRequest(request("sync"))).status, 200);
  assert.equal(validEmpty.calls.rpc.find((call) => call.name === "commit_google_health_sync").args.workouts.length, 0);
});

test("provider identity remains part of the idempotency key and ambiguous me identifiers are rejected", () => {
  const h = fixture();
  const first = sample();
  const second = { ...first, name: first.name.replace("users/123456/", "users/second-account/") };
  assert.notEqual(h.context.normalizeGoogleExercise(first).source_name, h.context.normalizeGoogleExercise(second).source_name);
  assert.throws(() => h.context.normalizeGoogleExercise({ ...first, name: first.name.replace("users/123456/", "users/me/") }), /invalid workout/);
  assert.throws(() => h.context.normalizeGoogleExercise({ ...first, name: first.name + "a".repeat(512) }), /invalid workout/);
});

test("legacy NULL archive state is active and expired OAuth state cannot exchange a code", async () => {
  const h = fixture({ archivedNull: true });
  assert.equal((await h.context.handleRequest(request("start"))).status, 200);
  h.rows.client_google_health_oauth_states = [{ state, client_email: user.email, owner_user_id: user.id, expires_at: "2000-01-01T00:00:00Z" }];
  assert.equal((await h.context.handleRequest(request("callback", { state, code: "code" }))).status, 400);
  assert.equal(h.calls.provider.length, 0);
});

test("a configured cross-origin redirect is rejected before creating OAuth state", async () => {
  const h = fixture({ env: { GOOGLE_HEALTH_REDIRECT_URI: "https://www.benjaminbenz.com/client-dashboard.html" } });
  const response = await h.context.handleRequest(request("start"));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "REDIRECT_ORIGIN_MISMATCH");
  assert.equal(h.calls.queries.filter((query) => query.action !== "select").length, 0);
});

test("provider revoke failure reports locally disconnected with a Google Account warning", async () => {
  for (const networkFailure of [false, true]) {
    const h = fixture({ provider: async () => { if (networkFailure) throw new Error("private network error"); return new Response("{}", { status: 503 }); } });
    const response = await h.context.handleRequest(request("disconnect"));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { connected: false, autoSync: false, revocationPending: true });
    assert.equal(h.rows.client_google_health_connections.length, 0);
    assert.equal(h.rows.client_google_health_oauth_states.length, 0);
  }
});

test("the background worker processes more than four due clients with at most four concurrent imports", async () => {
  let active = 0, maximum = 0;
  const extraConnections = Array.from({ length: 7 }, (_, index) => ({
    client_email: `client${index}@example.com`, owner_user_id: user.id, connection_id: generation,
    access_token: "private", refresh_token: "private", scope, expires_at: new Date(Date.now() + 3600000).toISOString(),
    auto_sync_enabled: true, needs_reconnect: false, last_sync_attempt_at: index === 6 ? new Date().toISOString() : null
  }));
  const h = fixture({ extraConnections, provider: async () => {
    maximum = Math.max(maximum, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return new Response("{}");
  } });
  const response = await h.context.handleRequest(request("sync-all", {}, { "X-FWB-Health-Sync-Secret": secret, Authorization: "" }));
  assert.deepEqual(await response.json(), { processed: 7, succeeded: 7, failed: 0 });
  assert.equal(maximum, 4);
  assert.equal(h.calls.rpc.filter((call) => call.name === "claim_google_health_sync").length, 7);
});
