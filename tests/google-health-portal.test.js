const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../client-dashboard.html"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name}`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

test("only a Google Health callback opts out of Supabase URL-code detection", () => {
  for (const callback of [false, true, undefined]) {
    let auth;
    const href = "https://benjaminbenz.com/client-dashboard.html?code=example";
    const window = {
      location: { href },
      FWB_SUPABASE_CONFIG: { url: "https://example.supabase.co", anonKey: "public-key" },
      FWB_AUTH_SESSION: { storage: {} },
      FWB_GOOGLE_HEALTH: callback === undefined ? undefined : {
        isCallbackUrl(value) { assert.equal(value, href); return callback; }
      },
      supabase: { createClient(_url, _key, options) { auth = options.auth; } }
    };
    vm.runInNewContext(source.slice(0, source.indexOf("const exerciseNameMatcher")), { window });
    assert.equal(auth.detectSessionInUrl, callback !== true);
    assert.equal(auth.persistSession, true);
    assert.equal(auth.autoRefreshToken, true);
  }
});

test("Google callback URLs never load analytics or send an authorization code in a page view", () => {
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.match(html, /<meta name="referrer" content="no-referrer"/);
  for (const search of ["?state=fwbgh_test&code=private-code", "?state=fwbgh_test&error=access_denied", "?tab=notifications"]) {
    const scripts = [], dataLayer = [];
    const window = { location: { search }, dataLayer };
    vm.runInNewContext(script, {
      window, dataLayer, URLSearchParams,
      document: { createElement: () => ({}), head: { appendChild: value => scripts.push(value) } }
    });
    const callback = search.includes("fwbgh_");
    assert.equal(scripts.length, callback ? 0 : 1);
    assert.equal(dataLayer.length, callback ? 0 : 2);
  }
});

test("configuring for another client destroys the old controller and opens Settings after consent", async () => {
  const calls = [];
  let options;
  const context = vm.createContext({
    clientGoogleHealthController: { destroy() { calls.push("destroy"); } },
    supabaseClient: {}, activeClientEmail: " Client@Example.com ", isCoachDashboardPreview: true,
    normalizeClientEmail: value => value.trim().toLowerCase(),
    setClientDashboardTab: tab => calls.push(tab),
    window: { location: { href: "https://example.com/client-dashboard.html" }, FWB_GOOGLE_HEALTH: { isCallbackUrl: () => false, createController(value) {
      options = value;
      return { initialize: async () => { calls.push("initialize"); }, destroy() {} };
    } } }
  });
  vm.runInContext(functionSource("configureClientGoogleHealth"), context);
  context.configureClientGoogleHealth();
  await Promise.resolve();
  assert.deepEqual(calls, ["destroy", "initialize"]);
  assert.equal(options.clientEmail, "client@example.com");
  assert.equal(options.isPreview, true);
  options.onConnected();
  assert.equal(calls.at(-1), "notifications");
});

test("Settings and Saved Logs refresh the same health controller without running an import", async () => {
  const refreshed = [], synced = [];
  const context = vm.createContext({
    activeClientDashboardTab: "home",
    document: { querySelectorAll: () => [] },
    syncClientDashboardMobileNavigationIcon() {},
    clientWebNotificationController: { refresh: async () => refreshed.push("notifications") },
    clientGoogleHealthController: {
      refresh: async () => refreshed.push("health"),
      sync: async () => synced.push("sync")
    }
  });
  vm.runInContext(functionSource("setClientDashboardTab"), context);
  context.setClientDashboardTab("home");
  context.setClientDashboardTab("notifications");
  context.setClientDashboardTab("logs");
  context.setClientDashboardTab("workouts");
  await Promise.resolve();
  assert.deepEqual(refreshed, ["notifications", "health", "health"]);
  assert.deepEqual(synced, []);
});

test("health module loads before portal auth and lifecycle hooks do not touch exercise data", () => {
  const health = html.indexOf('src="js/google-health.js');
  assert.ok(health >= 0 && health < html.indexOf('src="js/client-portal.js'));
  const load = functionSource("loadDashboard");
  assert.ok(load.indexOf("renderProgram(data)") < load.indexOf("configureClientGoogleHealth()"));
  assert.match(load, /clientGoogleHealthController\?\.destroy\(\)/);
  const signOut = functionSource("handleSignOut");
  assert.ok(signOut.indexOf("clientGoogleHealthController?.destroy()") < signOut.indexOf("supabaseClient.auth.signOut()"));
  assert.doesNotMatch(functionSource("configureClientGoogleHealth"), /trainingLogs|session_count|\.insert\(|\.update\(/);
});
