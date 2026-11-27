const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const portal = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const coach = fs.readFileSync(path.join(__dirname, "../js/coach-admin.js"), "utf8");
function functionSource(source, name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

test("client email links open messaging only after authenticated controller creation", () => {
  for (const [search, preview, user, expected] of [
    ["?messages=1", false, { id: "client-1", email: "client@example.com" }, true],
    ["?messages=0", false, { id: "client-1", email: "client@example.com" }, false],
    ["", false, { id: "client-1", email: "client@example.com" }, false],
    ["?messages=1", true, { id: "coach-1", email: "coach@example.com" }, false],
    ["?messages=1", false, null, false]
  ]) {
    const events = [];
    const trigger = {};
    const context = vm.createContext({
      URLSearchParams, isCoachDashboardPreview: preview, supabaseClient: {}, clientMessagesController: null,
      document: { querySelector: () => ({}), querySelectorAll: selector => selector === "[data-message-coach]" ? [trigger] : [] },
      window: { location: { search }, FWBCoachMessages: { createController(options) {
        events.push("created");
        assert.equal(options.user, user);
        return { open(email, _name, focusTarget) { events.push("opened"); assert.equal(email, user.email); assert.equal(focusTarget, trigger); } };
      } } }
    });
    vm.runInContext(functionSource(portal, "initializeClientMessages"), context);
    context.initializeClientMessages(user);
    assert.equal(events.includes("opened"), expected);
    if (expected) assert.deepEqual(events, ["created", "opened"]);
    if (preview || !user) assert.deepEqual(events, []);
  }
});

test("client email destination survives a missing session and same-origin login", async () => {
  const location = { origin: "https://benjaminbenz.com", pathname: "/client-dashboard.html", search: "?messages=1", hash: "" };
  const context = vm.createContext({
    URL, URLSearchParams, window: { location, FWB_AUTH_SESSION: { requiresLogin: () => true } },
    document: { querySelector: () => ({}) },
    clientMessagesController: null, clientGoogleHealthController: null, clientAppleHealthController: null, clientProfilePhotoController: null,
    supabaseClient: { auth: { getSession: async () => ({ data: { session: null } }) } },
    withTimeout: promise => promise, setDashboardMessage: () => assert.fail("Should return to login"),
    isCoachPortalEmail: () => false, clientDashboardUrl: "client-dashboard.html"
  });
  vm.runInContext(functionSource(portal, "loadDashboard") + functionSource(portal, "portalLoginDestination"), context);
  await context.loadDashboard();
  assert.equal(location.href, "client-login.html?return_to=%2Fclient-dashboard.html%3Fmessages%3D1");
  location.search = new URL(location.href, location.origin).search;
  assert.equal(context.portalLoginDestination({ email: "client@example.com" }), "https://benjaminbenz.com/client-dashboard.html?messages=1");
});

test("coach inbox and account approval links survive sign-in without forwarding client identity", async () => {
  const location = { origin: "https://benjaminbenz.com", pathname: "/coach-admin.html", search: "", hash: "" };
  const context = vm.createContext({
    URL, URLSearchParams, window: { location, FWB_AUTH_SESSION: { requiresLogin: () => true } },
    document: { getElementById: () => ({}), querySelector: () => null }, syncCoachAdminMobileNavigationMount() {},
    coachAdminTabNames: new Set(["home", "inbox", "clients"]), coachLoginUrl: "coach-login.html?v=1",
    coachSupabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
    withRequestTimeout: promise => promise, showCoachAccessError: () => assert.fail("Should return to login"),
    isCoachPortalEmail: () => true, clientDashboardUrl: "client-dashboard.html"
  });
  vm.runInContext(["requestedCoachAdminTab", "requestedCoachClientsSection", "sendToCoachLogin", "restoreCoachAdminUser"].map(name => functionSource(coach, name)).join("\n") + functionSource(portal, "portalLoginDestination"), context);
  location.search = "?tab=inbox&client=private%40example.com";
  assert.equal(context.requestedCoachAdminTab(), "inbox");
  await context.restoreCoachAdminUser();
  assert.equal(location.href, "coach-login.html?v=1&return_to=%2Fcoach-admin.html%3Ftab%3Dinbox");
  assert.doesNotMatch(location.href, /private|example|client%3D/);
  location.search = new URL(location.href, location.origin).search;
  assert.equal(context.portalLoginDestination({ email: "coach@example.com" }), "https://benjaminbenz.com/coach-admin.html?tab=inbox");
  for (const [search, hash] of [
    ["?tab=clients&client=private%40example.com", "#coach-access-requests-title"],
    ["?tab=clients&section=approvals&client=private%40example.com", ""]
  ]) {
    location.search = search;
    location.hash = hash;
    await context.restoreCoachAdminUser();
    assert.doesNotMatch(location.href, /private|example|client%3D/);
    const login = new URL(location.href, location.origin);
    assert.equal(login.searchParams.get("return_to"), "/coach-admin.html?tab=clients&section=approvals");
    location.search = login.search;
    assert.equal(context.portalLoginDestination({ email: "coach@example.com" }), "https://benjaminbenz.com/coach-admin.html?tab=clients&section=approvals");
  }
  context.sendToCoachLogin();
  assert.equal(location.href, "coach-login.html?v=1", "An explicit sign-out keeps the ordinary login destination");
});

test("ordinary coach sign-in opens Home and valid approval destinations return to their Clients section", () => {
  const location = { origin: "https://benjaminbenz.com", search: "" };
  const context = vm.createContext({
    URL, URLSearchParams, window: { location },
    isCoachPortalEmail: email => email === "coach@example.com", clientDashboardUrl: "client-dashboard.html"
  });
  vm.runInContext(functionSource(portal, "portalLoginDestination"), context);
  const coachUser = { email: "coach@example.com" };
  assert.equal(context.portalLoginDestination(coachUser), "/coach-admin.html?tab=home");
  assert.equal(context.portalLoginDestination({ email: "client@example.com" }), "client-dashboard.html");
  for (const returnTo of [
    "/coach-admin.html?tab=clients&section=approvals",
    "/coach-admin.html?tab=clients&client=private%40example.com#coach-access-requests-title"
  ]) {
    location.search = `?return_to=${encodeURIComponent(returnTo)}`;
    assert.equal(context.portalLoginDestination(coachUser), "https://benjaminbenz.com/coach-admin.html?tab=clients&section=approvals");
  }
  location.search = `?return_to=${encodeURIComponent("//untrusted.example/coach-admin.html?tab=clients&section=approvals")}`;
  assert.equal(context.portalLoginDestination(coachUser), "/coach-admin.html?tab=home");
});

test("authenticated coach inbox links activate the messaging controller", () => {
  const events = [];
  const context = vm.createContext({
    URLSearchParams, window: { location: { search: "?tab=inbox" }, FWBCoachMessages: { createController() { return { setActive: value => events.push(value) }; } } },
    document: { querySelector: () => ({}), querySelectorAll: () => [] },
    coachSupabase: {}, coachMessagesController: null, coachAdminTabNames: new Set(["home", "inbox"])
  });
  vm.runInContext(functionSource(coach, "requestedCoachAdminTab"), context);
  context.activeAdminTab = context.requestedCoachAdminTab();
  vm.runInContext(functionSource(coach, "initializeCoachMessages"), context);
  context.initializeCoachMessages({ id: "coach-1", email: "coach@example.com" });
  assert.deepEqual(events, [true]);
});


test("old Coach photo approval links forward to the owner workspace across sign-in", () => {
  let redirected;
  const location = {
    origin: "https://benjaminbenz.com", search: "?tab=approvals&client=private%40example.com",
    replace: (value) => { redirected = value; }
  };
  const context = vm.createContext({
    URL, URLSearchParams, window: { location },
    document: { getElementById: () => ({}) },
    isCoachPortalEmail: () => true, clientDashboardUrl: "client-dashboard.html"
  });
  vm.runInContext(functionSource(coach, "forwardLegacyCoachApprovals") + "\n" + functionSource(portal, "portalLoginDestination"), context);
  assert.equal(context.forwardLegacyCoachApprovals(), true);
  assert.equal(redirected, "/gruntr-admin.html?tab=approvals");
  location.search = `?return_to=${encodeURIComponent(redirected)}`;
  assert.equal(context.portalLoginDestination({ email: "coach@example.com" }), "https://benjaminbenz.com/gruntr-admin.html?tab=approvals");
});
