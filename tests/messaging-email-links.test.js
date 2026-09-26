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

test("coach email destination survives session restoration without putting client identity in the login URL", async () => {
  const location = { origin: "https://benjaminbenz.com", pathname: "/coach-admin.html", search: "?tab=inbox&client=private%40example.com", hash: "" };
  const context = vm.createContext({
    URL, URLSearchParams, window: { location, FWB_AUTH_SESSION: { requiresLogin: () => true } },
    document: { getElementById: () => ({}) }, syncCoachAdminMobileNavigationMount() {},
    coachAdminTabNames: new Set(["home", "inbox"]), coachLoginUrl: "client-login.html?v=1",
    coachSupabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
    withRequestTimeout: promise => promise, showCoachAccessError: () => assert.fail("Should return to login"),
    isCoachPortalEmail: () => true, clientDashboardUrl: "client-dashboard.html"
  });
  vm.runInContext(["requestedCoachAdminTab", "sendToCoachLogin", "restoreCoachAdminUser"].map(name => functionSource(coach, name)).join("\n") + functionSource(portal, "portalLoginDestination"), context);
  assert.equal(context.requestedCoachAdminTab(), "inbox");
  await context.restoreCoachAdminUser();
  assert.equal(location.href, "client-login.html?v=1&return_to=%2Fcoach-admin.html%3Ftab%3Dinbox");
  assert.doesNotMatch(location.href, /private|example|client%3D/);
  location.search = new URL(location.href, location.origin).search;
  assert.equal(context.portalLoginDestination({ email: "coach@example.com" }), "https://benjaminbenz.com/coach-admin.html?tab=inbox");
  context.sendToCoachLogin();
  assert.equal(location.href, "client-login.html?v=1", "An explicit sign-out keeps the ordinary login destination");
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
