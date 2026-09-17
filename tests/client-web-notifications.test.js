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

test("client Supabase auth explicitly persists and refreshes the session", () => {
  assert.match(portal, /createClient\(config\.url, config\.anonKey,\s*\{[\s\S]*?persistSession:\s*true/);
  assert.match(portal, /autoRefreshToken:\s*true/);
  assert.match(portal, /detectSessionInUrl:\s*true/);
});

test("client Home has a compact notification center and all feasible client choices", () => {
  const homePanel = dashboard.match(/data-client-dashboard-panel="home"[\s\S]*?data-client-dashboard-panel="workouts"/)?.[0] || "";
  assert.match(homePanel, /data-web-notifications hidden/);
  assert.match(homePanel, /data-web-notification-enable/);
  assert.match(homePanel, /data-web-notification-test/);
  assert.match(homePanel, /data-web-notification-list/);
  assert.match(homePanel, /data-web-notification-mark-all/);

  [
    "coach_replies",
    "program_updates",
    "workout_reminders",
    "weekly_check_ins",
    "monthly_reports",
    "session_balance",
    "nutrition_reminders",
    "progress_reminders",
    "achievements"
  ].forEach((preference) => {
    assert.match(homePanel, new RegExp(`data-web-notification-preference="${preference}"`));
  });
  assert.doesNotMatch(homePanel, /data-web-notification-preference="session_reminders"/);
  assert.match(styles, /\.client-home-card-notifications\s*\{[\s\S]*?grid-column:\s*1 \/ -1/);
  assert.match(styles, /\.web-notification-preference-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2/);
});

test("client initializes the shared controller after authentication and disconnects on sign out", () => {
  assert.match(portal, /initializeClientWebNotifications\(user\)/);
  assert.match(portal, /role:\s*"client"/);
  assert.match(portal, /clientWebNotificationController\?\.prepareForSignOut\?\.\(\)/);
  const prepareIndex = portal.indexOf("clientWebNotificationController?.prepareForSignOut?.()");
  const signOutIndex = portal.indexOf("supabaseClient.auth.signOut()", prepareIndex);
  assert.ok(prepareIndex >= 0 && signOutIndex > prepareIndex, "push subscription should be deactivated before signing out");
});

test("push permission remains user initiated and subscriptions are stored per signed-in user", () => {
  assert.match(notifications, /async function enableAlerts\(\)[\s\S]*?Notification\.requestPermission\(\)/);
  assert.match(notifications, /pushManager\.subscribe\(\{[\s\S]*?userVisibleOnly:\s*true/);
  assert.match(notifications, /from\("web_push_subscriptions"\)[\s\S]*?\.upsert\(\{/);
  assert.match(notifications, /user_id:\s*user\.id/);
  assert.match(notifications, /onConflict:\s*"user_id,endpoint"/);
  assert.match(notifications, /from\("client_notification_preferences"\)/);
  assert.match(notifications, /functions\.invoke\(functionName/);
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
