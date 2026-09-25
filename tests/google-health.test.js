const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/google-health.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../css/google-health.css"), "utf8");
const pendingKey = "fwb.google-health.pending";
const flush = () => new Promise(setImmediate);

function element() {
  const listeners = new Map();
  return {
    hidden: false, disabled: false, checked: false, textContent: "", innerHTML: "", attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, handler) { listeners.set(name, handler); },
    removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); },
    emit(name) { return listeners.get(name)?.({ preventDefault() {} }); }
  };
}

function fixture(options = {}) {
  const nodes = Object.fromEntries(["connect", "sync", "disconnect", "auto", "status", "last-sync", "message", "refresh", "revoke"].map((name) => [name, element()]));
  const root = element();
  root.querySelector = (selector) => nodes[selector.match(/data-google-health-(.*)\]/)[1]];
  const activityRoot = element();
  const activityStatus = element();
  const storage = new Map();
  const calls = [];
  const queries = [];
  const replaced = [];
  const redirects = [];
  let email = options.sessionEmail || "client@example.com";
  let status = { configured: true, connected: true, autoSync: true, needsReconnect: false, lastSyncedAt: "2026-09-24T18:00:00Z", ...options.status };
  let rows = options.rows || [];
  if (options.pending) storage.set(pendingKey, JSON.stringify(options.pending));
  const global = {
    URL, Date, Promise,
    location: { href: options.href || "https://www.benjaminbenz.com/client-dashboard.html", assign(value) { redirects.push(value); } },
    history: { state: { same: true }, replaceState(state, title, value) { replaced.push(value); } },
    sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    document: { querySelector: (selector) => selector.includes("settings") ? root : selector.includes("activities-status") ? activityStatus : activityRoot }
  };
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: "user-token", user: { email } } } }) },
    functions: { async invoke(name, request) {
      calls.push({ name, ...request });
      const action = request.body.action;
      const custom = options.invoke?.(action, request.body);
      if (custom !== undefined) return custom;
      if (action === "status") return { data: { ...status } };
      if (action === "start") return { data: { state: "fwbgh_example", authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?state=fwbgh_example" } };
      if (action === "set-auto-sync") { status.autoSync = request.body.enabled; return { data: { ...status } }; }
      if (action === "callback") { status.connected = true; status.autoSync = true; return { data: { connected: true, autoSync: true } }; }
      if (action === "disconnect") { status.connected = false; return { data: { connected: false } }; }
      if (action === "sync") return { data: { connected: true, imported: 1, updated: 0, lastSyncedAt: status.lastSyncedAt } };
      throw new Error(`Unexpected action ${action}`);
    } },
    from(table) {
      const query = { table, filters: [] };
      queries.push(query);
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(column, value) { query.filters.push([column, value]); return builder; },
        order(column, settings) { (query.orders ||= []).push([column, settings]); return builder; },
        limit(count) { query.limit = count; return options.queryResult?.() || Promise.resolve({ data: rows }); }
      };
      return builder;
    }
  };
  vm.runInNewContext(source, { window: global, URL, Date, Promise });
  const api = global.FWB_GOOGLE_HEALTH;
  let connected = 0;
  let controller;
  controller = api.createController({ supabaseClient: client, clientEmail: "Client@example.com", isPreview: options.preview, root, activityRoot,
    onConnected() { connected++; options.onConnected?.(controller); } });
  return { nodes, root, activityRoot, activityStatus, calls, queries, storage, replaced, redirects, api, controller,
    setEmail(value) { email = value; }, setRows(value) { rows = value; }, get connected() { return connected; } };
}

test("Settings independently loads connection status and read-only imported workouts", async () => {
  const h = fixture({ rows: [{ workout_date: "2026-09-24", activity_type: '<img src=x onerror="x">', duration_seconds: 2700, calories: 0, distance_meters: 0, average_heart_rate: null }] });
  await h.controller.initialize();
  assert.deepEqual(h.calls.map((call) => call.body.action), ["status"]);
  assert.equal(h.calls[0].headers.Authorization, "Bearer user-token");
  assert.equal(h.queries[0].table, "client_google_health_workouts");
  assert.deepEqual(h.queries[0].filters, [["client_email", "client@example.com"]]);
  assert.equal(h.queries[0].limit, 50);
  assert.doesNotMatch(h.queries[0].columns, /access_token|refresh_token/);
  assert.equal(h.nodes.auto.checked, true);
  assert.equal(h.nodes.status.textContent, "Automatic sync on");
  assert.match(h.activityRoot.innerHTML, /45 min/);
  assert.match(h.activityRoot.innerHTML, /0 kcal/);
  assert.match(h.activityRoot.innerHTML, /0 km/);
  assert.doesNotMatch(h.activityRoot.innerHTML, /Average heart rate|<img/);
  assert.match(h.activityRoot.innerHTML, /&lt;img/);
  await h.controller.refresh();
  assert.deepEqual(h.calls.map((call) => call.body.action), ["status", "status"]);
});

test("connect stores client-bound state before navigating only to Google", async () => {
  const h = fixture({ status: { connected: false } });
  await h.controller.initialize();
  await h.nodes.connect.emit("click");
  const pending = JSON.parse(h.storage.get(pendingKey));
  assert.equal(pending.clientEmail, "client@example.com");
  assert.equal(pending.state, "fwbgh_example");
  assert.ok(pending.createdAt > Date.now() - 2000);
  assert.match(h.redirects[0], /^https:\/\/accounts.google.com\//);
  assert.equal(Object.hasOwn(h.calls[1].body, "clientEmail"), false);
  const invalid = fixture({ invoke(action) { if (action === "start") return { data: { state: "fwbgh_bad", authorizationUrl: "https://attacker.example/?state=fwbgh_bad" } }; } });
  await invalid.controller.initialize();
  await invalid.nodes.connect.emit("click");
  assert.equal(invalid.redirects.length, 0);
  assert.equal(invalid.storage.has(pendingKey), false);
});

test("valid OAuth callback is consumed once, scrubbed, then imports and opens Settings", async () => {
  const h = fixture({
    href: "https://www.benjaminbenz.com/client-dashboard.html?tab=logs&state=fwbgh_state&code=private-code&scope=activity#saved",
    pending: { state: "fwbgh_state", clientEmail: "client@example.com", createdAt: Date.now() },
    onConnected(controller) { void controller.refresh(); }
  });
  assert.equal(h.api.isCallbackUrl("https://site.example/?code=login-code"), false);
  assert.equal(h.api.isCallbackUrl("https://site.example/?code=health-code&state=fwbgh_state"), true);
  await Promise.all([h.controller.initialize(), h.controller.initialize()]);
  assert.equal(h.calls.filter((call) => call.body.action === "callback").length, 1);
  assert.equal(h.calls.filter((call) => call.body.action === "sync").length, 1);
  assert.equal(h.connected, 1);
  assert.equal(h.storage.has(pendingKey), false);
  assert.deepEqual(h.replaced, ["/client-dashboard.html?tab=logs#saved"]);
  assert.match(h.nodes.message.textContent, /1 new workout/);
});

test("invalid, expired, wrong-account, and canceled callbacks never exchange a code", async () => {
  for (const pending of [null, { state: "wrong", clientEmail: "client@example.com", createdAt: Date.now() }, { state: "fwbgh_state", clientEmail: "other@example.com", createdAt: Date.now() }, { state: "fwbgh_state", clientEmail: "client@example.com", createdAt: Date.now() - 660000 }]) {
    const h = fixture({ href: "https://site.example/?state=fwbgh_state&code=secret", pending });
    await h.controller.initialize();
    assert.equal(h.calls.some((call) => call.body.action === "callback"), false);
    assert.match(h.nodes.message.textContent, /expired or belongs to another/);
    assert.equal(h.storage.has(pendingKey), false);
  }
  const canceled = fixture({ href: "https://site.example/?state=fwbgh_state&error=access_denied", pending: { state: "fwbgh_state", clientEmail: "client@example.com", createdAt: Date.now() } });
  await canceled.controller.initialize();
  assert.match(canceled.nodes.message.textContent, /not connected/);
  assert.equal(canceled.calls.some((call) => call.body.action === "callback"), false);
});

test("automatic sync can pause while Sync now remains available; disconnect retains imports", async () => {
  const h = fixture({ rows: [{ workout_date: "2026-09-24", activity_type: "Running", duration_seconds: 1500 }] });
  await h.controller.initialize();
  h.nodes.auto.checked = false;
  await h.nodes.auto.emit("change");
  assert.equal(h.nodes.auto.checked, false);
  assert.equal(h.nodes.status.textContent, "Automatic sync paused");
  assert.equal(h.nodes.sync.disabled, false);
  await h.controller.sync();
  assert.equal(h.calls.some((call) => call.body.action === "sync"), true);
  await h.nodes.disconnect.emit("click");
  assert.equal(h.nodes.status.textContent, "Not connected");
  assert.equal(h.nodes.sync.hidden, true);
  assert.equal(h.nodes.auto.disabled, true);
  assert.match(h.activityRoot.innerHTML, /Running/);
  assert.match(h.nodes.message.textContent, /remain in Saved logs/);
});

test("preview can read client imports but cannot connect, sync, pause, or disconnect", async () => {
  const h = fixture({ preview: true, sessionEmail: "coach@example.com" });
  await h.controller.initialize();
  await h.nodes.connect.emit("click");
  await h.nodes.auto.emit("change");
  await h.nodes.disconnect.emit("click");
  await h.controller.sync();
  assert.equal(h.calls.length, 0);
  assert.equal(h.queries.length, 1);
  assert.equal(h.nodes.connect.disabled, true);
  assert.equal(h.nodes.auto.disabled, true);
});

test("disconnect succeeds locally while a Google revocation failure explains the remaining action", async () => {
  const h = fixture({ invoke(action) { if (action === "disconnect") return { data: { connected: false, autoSync: false, revocationPending: true } }; } });
  await h.controller.initialize();
  await h.nodes.disconnect.emit("click");
  assert.equal(h.nodes.status.textContent, "Not connected");
  assert.equal(h.nodes.disconnect.hidden, true);
  assert.equal(h.nodes.revoke.hidden, false);
  assert.match(h.nodes.message.textContent, /disconnected from FWB/);
  assert.match(h.nodes.message.textContent, /Google Account connections/);
  assert.doesNotMatch(h.nodes.message.textContent, /Could not disconnect|try again/);
});

test("missing setup, revoked access, and service errors remain visible and recoverable", async () => {
  const missing = fixture({ status: { configured: false, connected: false } });
  await missing.controller.initialize();
  assert.equal(missing.nodes.connect.disabled, true);
  assert.match(missing.nodes.message.textContent, /not available yet/);
  const revoked = fixture({ status: { needsReconnect: true } });
  await revoked.controller.initialize();
  assert.equal(revoked.nodes.connect.textContent, "Reconnect Google");
  assert.equal(revoked.nodes.sync.disabled, true);
  assert.equal(revoked.nodes.disconnect.disabled, false);
  const failed = fixture({ invoke(action) { if (action === "status") return { error: new Error("private provider response") }; } });
  await failed.controller.initialize();
  assert.equal(failed.nodes.status.textContent, "Connection status unavailable");
  assert.equal(failed.nodes.refresh.disabled, false);
  assert.doesNotMatch(failed.nodes.message.textContent, /private provider/);
});

test("destroy and account switching prevent late response rendering or subsequent writes", async () => {
  let resolveStatus;
  const h = fixture({ invoke(action) { if (action === "status") return new Promise((resolve) => { resolveStatus = resolve; }); } });
  const pending = h.controller.initialize();
  await flush();
  h.controller.destroy();
  resolveStatus({ data: { configured: true, connected: true, autoSync: true } });
  await pending;
  assert.equal(h.activityRoot.innerHTML, "");
  assert.notEqual(h.nodes.status.textContent, "Automatic sync on");
  await h.nodes.connect.emit("click");
  assert.equal(h.calls.length, 1);
  const switched = fixture();
  await switched.controller.initialize();
  switched.setEmail("another@example.com");
  await switched.nodes.disconnect.emit("click");
  assert.equal(switched.calls.some((call) => call.body.action === "disconnect"), false);
});

test("a failed imported-workout refresh retains records and shows the failure", async () => {
  let unavailable = false;
  const h = fixture({ rows: [{ workout_date: "2026-09-24", activity_type: "Cycling" }], queryResult() { if (unavailable) return Promise.resolve({ error: new Error("database unavailable") }); } });
  await h.controller.initialize();
  unavailable = true;
  await h.controller.refresh();
  assert.match(h.activityRoot.innerHTML, /Cycling/);
  assert.match(h.activityStatus.textContent, /could not be refreshed/);
  unavailable = false;
  await h.controller.refresh();
  assert.equal(h.activityStatus.textContent, "");
});

test("Settings and Saved Logs markup keep Google controls separate and mobile controls accessible", () => {
  assert.match(html, /<\/article>\s*<article class="google-health-settings" data-google-health-settings/);
  assert.match(html, /data-google-health-message role="status" aria-live="polite"/);
  assert.match(html, /<label class="google-health-auto">\s*<input type="checkbox" data-google-health-auto/);
  assert.match(html, /id="client-training-log-history"[\s\S]*?data-google-health-activities[\s\S]*?data-client-dashboard-panel="notifications"/);
  assert.ok(html.indexOf('src="js/google-health.js') < html.indexOf('src="js/client-portal.js'));
  assert.match(styles, /min-height: 48px/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
});
