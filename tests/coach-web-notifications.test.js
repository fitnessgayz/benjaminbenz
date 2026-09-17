const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");
const sharedSource = fs.readFileSync(path.join(projectRoot, "js/web-notifications.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");

const coachPreferenceKeys = [
  "client_workout_completed",
  "client_check_ins",
  "client_workout_comments",
  "client_form_checks",
  "client_progress_updates",
  "client_dexa_uploads",
  "client_questionnaires",
  "client_coach_requests",
  "client_session_balance",
  "client_nutrition_activity",
  "client_inactivity"
];

test("keeps Session Logger first and adds a coach Settings destination", () => {
  const navigationStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const navigationEnd = adminHtml.indexOf("</nav>", navigationStart);
  const navigation = adminHtml.slice(navigationStart, navigationEnd);
  const sessionLogger = navigation.indexOf('href="coach-workout-log.html"');
  const firstPanelTab = navigation.indexOf("data-admin-tab=");

  assert.ok(sessionLogger >= 0);
  assert.ok(sessionLogger < firstPanelTab);
  assert.match(navigation, /data-admin-tab="notifications"[^>]*aria-label="Settings"/);
  assert.match(navigation, /admin-nav-settings-icon/);
  assert.match(navigation, /<span class="admin-nav-label">Settings<\/span>/);
  assert.match(navigation, /data-web-notification-unread/);
});

test("Settings panel keeps every notification feature together", () => {
  const panelStart = adminHtml.indexOf('data-admin-panel="notifications"');
  const panelEnd = adminHtml.indexOf("</section>", panelStart);
  const settingsPanel = adminHtml.slice(panelStart, panelEnd);

  assert.ok(panelStart >= 0);
  assert.match(settingsPanel, /<p class="kicker">Settings<\/p>/);
  assert.match(settingsPanel, /<h2 id="coach-notification-title">Notification settings<\/h2>/);
  assert.match(settingsPanel, /data-web-notification-enable/);
  assert.match(settingsPanel, /data-web-notification-test[^>]*disabled/);
  assert.match(settingsPanel, /data-web-notification-status[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(settingsPanel, /data-web-notification-list[^>]*aria-live="polite"/);
  assert.match(settingsPanel, /data-web-notification-empty/);
  assert.match(settingsPanel, /data-web-notification-mark-all[^>]*hidden/);
  assert.match(adminHtml, /src="js\/web-notifications\.js\?v=coach-workout-alerts-1"[\s\S]*src="js\/coach-admin\.js\?v=coach-home-dashboard-1"/);
});

test("all feasible coach notification categories start enabled", () => {
  for (const key of coachPreferenceKeys) {
    assert.match(
      adminHtml,
      new RegExp(`data-web-notification-preference="${key}" checked`),
      `${key} should be enabled by default`
    );
    assert.match(sharedSource, new RegExp(`"${key}"`), `${key} should be accepted by the shared controller`);
  }

  assert.doesNotMatch(adminHtml, /appointment reminder/i);
  assert.match(sharedSource, /client_workout_completed:\s*"workout_completed"/);
  assert.match(sharedSource, /deployedFunctionName\s*=\s*"fwb-web-push"/);
  assert.match(sharedSource, /from\("fwb_notification_settings"\)/);
  assert.match(sharedSource, /from\("fwb_web_push_subscriptions"\)|fwb_web_push_subscriptions/);
  assert.match(sharedSource, /deployedSchemaErrorCodes = new Set\(\["42703", "42P01", "PGRST204", "PGRST205"\]\)/);
  assert.match(sharedSource, /if \(!isDeployedSchemaFallback\(probe\.error\)\) \{\s*throw probe\.error;/);
  assert.match(sharedSource, /preferenceSavePromise\.then\(\(\) => persistPreferences\(updates\)\)/);
  assert.match(sharedSource, /await savePreferences\(\{ \[key\]: input\.checked \}\);\s*renderPreferences\(\);/);
});

test("coach auth explicitly persists and refreshes its Supabase session", () => {
  assert.match(adminSource, /createClient\(coachConfig\.url, coachConfig\.anonKey,\s*\{/);
  assert.match(adminSource, /persistSession:\s*true/);
  assert.match(adminSource, /autoRefreshToken:\s*true/);
  assert.match(adminSource, /detectSessionInUrl:\s*true/);
});

test("coach notification controller initializes, refreshes, and cleans up before sign-out", () => {
  assert.match(adminSource, /FWBWebNotifications\?\.createController/);
  assert.match(adminSource, /role:\s*"coach"/);
  assert.match(adminSource, /await coachNotificationsController\.init\(\)/);
  assert.match(adminSource, /nextTab === "notifications" && coachNotificationsController/);
  assert.match(adminSource, /coachNotificationsController\.refresh\(\)/);
  assert.match(adminSource, /await coachNotificationsController\.prepareForSignOut\(\)/);
  assert.match(adminSource, /prepareForSignOut[\s\S]*?coachSupabase\.auth\.signOut\(\)/);
});

test("notification deep links open only allowlisted coach panels", () => {
  assert.match(adminSource, /const coachAdminTabNames = new Set\(\[/);
  assert.match(adminSource, /"notifications"/);
  assert.match(adminSource, /new URLSearchParams\(window\.location\.search\)\.get\("tab"\)/);
  assert.match(adminSource, /coachAdminTabNames\.has\(requestedTab\) \? requestedTab : "home"/);
  assert.match(adminSource, /let activeAdminTab = requestedCoachAdminTab\(\)/);
});

test("coach notification settings stay compact and stack on narrow screens", () => {
  assert.match(styleSource, /\.coach-notification-preference-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s);
  assert.match(styleSource, /@media \(max-width: 780px\)[\s\S]*?\.coach-notification-preference-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  assert.match(styleSource, /\.admin-nav-unread-count\s*\{[^}]*position:\s*absolute/s);
});
