const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const notifications = fs.readFileSync(path.join(root, "js/web-notifications.js"), "utf8");
const worker = fs.readFileSync(path.join(root, "timer-notifications-sw.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function fakeElement() {
  const classes = new Set();
  return {
    children: [],
    dataset: {},
    hidden: false,
    textContent: "",
    classList: {
      toggle(name, enabled) {
        if (enabled) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      }
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this[name] = value;
    }
  };
}

function createClientNotificationHarness({ deferredPreferences = false } = {}) {
  const internalBadge = fakeElement();
  const externalBadges = [fakeElement(), fakeElement()];
  const unreadStatus = fakeElement();
  const list = fakeElement();
  const empty = fakeElement();
  const markAll = fakeElement();
  const rows = [{
    id: "notice-1",
    title: "New workout",
    body: "Your coach updated your plan.",
    action_url: "/client-dashboard.html?tab=workouts",
    created_at: "2026-09-17T12:00:00.000Z",
    read_at: null
  }];
  let preferenceProbeCount = 0;
  let releasePreferences = () => {};
  const preferenceGate = deferredPreferences
    ? new Promise((resolve) => {
      releasePreferences = resolve;
    })
    : Promise.resolve();
  const preferences = { user_id: "client-1", push_enabled: false };
  const selectorElements = new Map([
    ["[data-web-notification-list]", list],
    ["[data-web-notification-empty]", empty],
    ["[data-web-notification-unread]", internalBadge],
    ["[data-web-notification-mark-all]", markAll]
  ]);
  const rootElement = fakeElement();
  rootElement.querySelector = (selector) => selectorElements.get(selector) || null;
  rootElement.querySelectorAll = () => [];
  rootElement.addEventListener = () => {};
  rootElement.removeEventListener = () => {};
  const supabaseClient = {
    from(table) {
      const query = {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        async maybeSingle() {
          preferenceProbeCount += 1;
          await preferenceGate;
          return { data: preferences, error: null };
        },
        async single() {
          return { data: preferences, error: null };
        },
        async limit() {
          return { data: rows, error: null };
        }
      };
      assert.ok(["client_notification_preferences", "client_notifications"].includes(table));
      return query;
    }
  };
  const document = { createElement: () => fakeElement() };
  const sandbox = {
    window: {
      document,
      navigator: {},
      isSecureContext: false,
      location: { origin: "https://fitness.test" },
      URL,
      atob(value) {
        return Buffer.from(value, "base64").toString("binary");
      }
    },
    URL,
    Intl,
    Uint8Array,
    Buffer
  };
  vm.runInNewContext(notifications, sandbox);
  const controller = sandbox.window.FWBWebNotifications.createController({
    supabaseClient,
    user: { id: "client-1" },
    role: "client",
    root: rootElement,
    unreadBadges: externalBadges,
    unreadStatus
  });

  return {
    controller,
    badges: [internalBadge, ...externalBadges],
    unreadStatus,
    rows,
    releasePreferences,
    preferenceProbeCount: () => preferenceProbeCount
  };
}

test("client Supabase auth explicitly persists and refreshes the session", () => {
  assert.match(portal, /createClient\(config\.url, config\.anonKey,\s*\{[\s\S]*?persistSession:\s*true/);
  assert.match(portal, /autoRefreshToken:\s*true/);
  assert.match(portal, /detectSessionInUrl:\s*true/);
});

test("client Settings keeps every notification feature together", () => {
  const homePanel = dashboard.match(/data-client-dashboard-panel="home"[\s\S]*?data-client-dashboard-panel="workouts"/)?.[0] || "";
  const settingsStart = dashboard.indexOf('data-client-dashboard-panel="notifications"');
  const settingsEnd = dashboard.indexOf("<dialog", settingsStart);
  const settingsPanel = dashboard.slice(settingsStart, settingsEnd);

  assert.doesNotMatch(homePanel, /data-web-notifications/);
  assert.ok(settingsStart >= 0);
  assert.match(settingsPanel, /<p class="kicker">Settings<\/p>/);
  assert.match(settingsPanel, /<h2 id="client-notification-settings-title">Notification settings<\/h2>/);
  assert.match(settingsPanel, /data-web-notifications hidden/);
  assert.match(settingsPanel, /data-web-notification-enable/);
  assert.match(settingsPanel, /data-web-notification-test/);
  assert.match(settingsPanel, /data-web-notification-list[^>]*aria-live="polite"/);
  assert.match(settingsPanel, /data-web-notification-mark-all/);
  assert.match(settingsPanel, /data-rest-timer-notifications/);
  assert.match(settingsPanel, /class="web-notification-settings" open/);

  [
    "coach_replies",
    "program_updates",
    "workout_reminders",
    "weekly_check_ins",
    "monthly_reports",
    "session_reminders",
    "session_balance",
    "nutrition_reminders",
    "progress_reminders",
    "achievements"
  ].forEach((preference) => {
    assert.match(settingsPanel, new RegExp(`data-web-notification-preference="${preference}"`));
  });
  assert.match(styles, /\.client-home-card-notifications\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(styles, /\.web-notification-preference-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
  assert.match(styles, /\.client-dashboard-nav-unread\s*\{[^}]*position:\s*absolute/s);
});

test("client initializes the shared controller after authentication and disconnects on sign out", () => {
  assert.match(portal, /initializeClientWebNotifications\(user\)/);
  assert.match(portal, /data-client-dashboard-panel="notifications".*data-web-notifications/);
  assert.match(portal, /role:\s*"client"/);
  assert.match(portal, /unreadBadges:\s*document\.querySelectorAll\("\[data-client-notification-unread\]"\)/);
  assert.match(portal, /unreadStatus:\s*document\.querySelector\("\[data-client-notification-unread-status\]"\)/);
  assert.match(portal, /nextTab === "notifications" && clientWebNotificationController/);
  assert.match(portal, /clientWebNotificationController\.refresh\(\)/);
  assert.match(portal, /setClientNotificationSettingsAvailable\(!isCoachDashboardPreview\)/);
  assert.match(portal, /clientWebNotificationController\?\.prepareForSignOut\?\.\(\)/);
  const prepareIndex = portal.indexOf("clientWebNotificationController?.prepareForSignOut?.()");
  const signOutIndex = portal.indexOf("supabaseClient.auth.signOut()", prepareIndex);
  assert.ok(prepareIndex >= 0 && signOutIndex > prepareIndex, "push subscription should be deactivated before signing out");
});

test("push permission remains user initiated and subscriptions are stored per signed-in user", () => {
  assert.match(notifications, /async function enableAlerts\(\)[\s\S]*?Notification\.requestPermission\(\)/);
  assert.match(notifications, /pushManager\.subscribe\(\{[\s\S]*?userVisibleOnly:\s*true/);
  assert.match(notifications, /"fwb_web_push_subscriptions"/);
  assert.match(notifications, /"web_push_subscriptions"/);
  assert.match(notifications, /\.upsert\(subscriptionPayload/);
  assert.match(notifications, /user_id:\s*user\.id/);
  assert.match(notifications, /backend === "deployed" \? "endpoint" : "user_id,endpoint"/);
  assert.match(notifications, /from\("client_notification_preferences"\)/);
  assert.match(notifications, /from\("fwb_notification_settings"\)/);
  assert.match(notifications, /web_url/);
  assert.match(notifications, /functions\.invoke\(functionName/);
  assert.match(notifications, /const externalUnreadBadges = Array\.from\(options\.unreadBadges/);
  assert.match(notifications, /unreadBadges\.forEach\(\(unreadBadge\) =>/);
  assert.match(notifications, /if \(!refreshPromise\)[\s\S]*?const pendingRefresh = refreshPromise/);
  assert.match(notifications, /if \(refreshPromise === pendingRefresh\)[\s\S]*?refreshPromise = null/);
  assert.match(notifications, /setBusy\(true\)[\s\S]*?const loaded = await refresh\(\)[\s\S]*?setBusy\(false\)/);
});

test("client unread badges stay synchronized and refresh initialization is deduplicated", async () => {
  const harness = createClientNotificationHarness({ deferredPreferences: true });
  const initialization = harness.controller.init();
  const overlappingRefresh = harness.controller.refresh();

  assert.equal(harness.preferenceProbeCount(), 1);
  harness.releasePreferences();
  assert.equal(await initialization, true);
  assert.equal(await overlappingRefresh, true);
  assert.equal(harness.preferenceProbeCount(), 1);
  harness.badges.forEach((badge) => {
    assert.equal(badge.textContent, "1");
    assert.equal(badge.hidden, false);
    assert.equal(badge["aria-label"], "1 unread notification");
  });
  assert.equal(harness.unreadStatus.textContent, "1 unread notification");

  harness.rows[0].read_at = "2026-09-17T12:05:00.000Z";
  assert.equal(await harness.controller.refresh(), true);
  harness.badges.forEach((badge) => {
    assert.equal(badge.textContent, "");
    assert.equal(badge.hidden, true);
    assert.equal(badge["aria-label"], "0 unread notifications");
  });
  assert.equal(harness.unreadStatus.textContent, "0 unread notifications");
});

test("shared notification URL helper rejects cross-origin and protocol-relative destinations", () => {
  const sandbox = {
    window: {
      navigator: {},
      location: { origin: "https://fitness.test" },
      URL,
      atob(value) {
        return Buffer.from(value, "base64").toString("binary");
      }
    },
    URL,
    Intl,
    Uint8Array,
    Buffer
  };
  vm.runInNewContext(notifications, sandbox);
  const { safeActionUrl } = sandbox.window.FWBWebNotifications;

  assert.equal(safeActionUrl("/client-dashboard.html?tab=logs", "client"), "/client-dashboard.html?tab=logs");
  assert.equal(safeActionUrl("https://attacker.test/redirect", "client"), "/client-dashboard.html?tab=home");
  assert.equal(safeActionUrl("//attacker.test/redirect", "coach"), "/coach-admin.html");
});

test("service worker renders generic payload copy while retaining timer Workouts behavior", () => {
  assert.match(worker, /value\?\.title/);
  assert.match(worker, /value\?\.body/);
  assert.match(worker, /value\?\.tag/);
  assert.match(worker, /value\?\.data\?\.url/);
  assert.match(worker, /destination\.origin === self\.location\.origin/);
  assert.match(worker, /searchParams\.get\("tab"\) === "workouts"/);
  assert.match(worker, /postMessage\(\{ type: "FWB_OPEN_WORKOUTS" \}\)/);
  assert.match(worker, /dashboard\.navigate\(destination\)/);
});
