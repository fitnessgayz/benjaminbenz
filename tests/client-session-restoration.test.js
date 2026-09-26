const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const policy = fs.readFileSync(path.join(__dirname, "../js/auth-session.js"), "utf8");

function functionSource(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

function harness(result) {
  const redirects = [];
  const messages = [];
  const window = { location: {
    origin: "https://fwb.example", pathname: "/client-dashboard.html", search: "", hash: "",
    replace: url => redirects.push(url)
  } };
  const context = vm.createContext({
    window, URL, URLSearchParams, portalLoginSubmitting: false, clientMessagesController: null, clientGoogleHealthController: null, clientProfilePhotoController: null, clientAppleHealthController: null,
    supabaseClient: { auth: { getSession: async () => {
      if (result instanceof Error) throw result;
      return result;
    } } },
    document: { getElementById: () => ({}), querySelector: () => ({}) },
    withTimeout: promise => promise,
    setDashboardMessage: (...args) => messages.push(args),
    isCoachPortalEmail: email => email === "coach@example.com",
    clientDashboardUrl: "client-dashboard.html"
  });
  vm.runInContext(policy, context);
  for (const name of ["portalLoginDestination", "restorePortalLogin", "loadDashboard", "signInToPortal"]) {
    vm.runInContext(functionSource(name), context);
  }
  return { context, window, redirects, messages };
}

for (const email of ["client@example.com", "coach@example.com"]) {
  test(`saved ${email.split("@")[0]} login reopens the correct dashboard`, async () => {
    const h = harness({ data: { session: { user: { email } } } });
    await h.context.restorePortalLogin();
    assert.match(h.redirects[0], email.startsWith("coach") ? /^coach-admin\.html/ : /^client-dashboard\.html/);
  });
}

test("restoration keeps an internal return destination and rejects external or looping destinations", () => {
  const h = harness();
  for (const returnTo of ["//evil.example", "/\\evil.example", "/client-login.html"]) {
    h.window.location.search = `?return_to=${encodeURIComponent(returnTo)}`;
    assert.equal(h.context.portalLoginDestination({ email: "client@example.com" }), "client-dashboard.html");
  }
  h.window.location.search = `?return_to=${encodeURIComponent("/coach-workout-log.html?client=123#today")}`;
  assert.equal(h.context.portalLoginDestination({ email: "coach@example.com" }), "https://fwb.example/coach-workout-log.html?client=123#today");
});

test("restoration never interrupts a submitted login or redirects on a refresh error", async () => {
  const h = harness({ data: { session: { user: { email: "client@example.com" } } } });
  h.context.portalLoginSubmitting = true;
  await h.context.restorePortalLogin();
  assert.deepEqual(h.redirects, []);
  for (const result of [{ data: { session: null } }, { error: { status: 503 } }, new TypeError("offline")]) {
    const failure = harness(result);
    await failure.context.restorePortalLogin();
    assert.deepEqual(failure.redirects, []);
  }
});

test("dashboard preserves login during returned and thrown temporary connection errors", async () => {
  for (const result of [{ error: { status: 503 } }, { error: { name: "AuthRetryableFetchError" } }, new TypeError("offline")]) {
    const h = harness(result);
    await h.context.loadDashboard();
    assert.equal(h.window.location.href, undefined);
    assert.equal(h.messages.length, 1);
  }
});

test("dashboard sends missing and expired sessions back to login with the original route", async () => {
  for (const result of [{ data: { session: null } }, { error: { code: "refresh_token_not_found", status: 400 } }]) {
    const h = harness(result);
    h.window.location.search = "?tab=training";
    await h.context.loadDashboard();
    assert.equal(h.window.location.href, "client-login.html?return_to=%2Fclient-dashboard.html%3Ftab%3Dtraining");
  }
});

for (const remember of [true, false]) {
  test(`login chooses ${remember ? "persistent" : "temporary"} storage before the SDK saves tokens`, async () => {
    const h = harness();
    const calls = [];
    h.context.supabaseClient.auth.initialize = async () => { calls.push("initialized"); };
    h.window.FWB_AUTH_SESSION.setRememberMe = choice => calls.push(choice);
    h.context.FormData = class { get(name) { return name === "email" ? "client@example.com" : "password"; } };
    h.context.supabaseClient.auth.signInWithPassword = async credentials => {
      assert.equal(credentials.email, "client@example.com");
      assert.equal(credentials.password, "password");
      calls.push("signed in");
      return { data: { user: { email: credentials.email } } };
    };
    await h.context.signInToPortal({ elements: { remember_me: { checked: remember } } });
    assert.deepEqual(calls, ["initialized", remember, "signed in"]);
  });
}
