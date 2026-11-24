const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");
const sharedSource = fs.readFileSync(path.join(projectRoot, "js/web-notifications.js"), "utf8");
const styleSource = fs.readFileSync(path.join(projectRoot, "css/style.css"), "utf8");
const darkStyleSource = fs.readFileSync(path.join(projectRoot, "css/fwb-dark-theme.css"), "utf8");

const coachPreferenceKeys = [
  "client_logins",
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

test("keeps Home first and adds a coach Recent Activity destination", () => {
  const navigationStart = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const navigationEnd = adminHtml.indexOf("</nav>", navigationStart);
  const navigation = adminHtml.slice(navigationStart, navigationEnd);
  const home = navigation.indexOf('data-admin-tab="home"');
  const sessionLogger = navigation.indexOf('href="coach-workout-log.html"');
  const inboxTab = navigation.indexOf('data-admin-tab="inbox"');
  const settingsTab = navigation.indexOf('data-admin-tab="notifications"');

  assert.ok(home >= 0);
  assert.ok(sessionLogger >= 0);
  assert.ok(home < sessionLogger);
  assert.ok(settingsTab > inboxTab);
  assert.equal(settingsTab, navigation.lastIndexOf("data-admin-tab="));
  assert.match(navigation, /data-admin-tab="notifications"[^>]*aria-label="Activity"/);
  assert.match(navigation, /admin-nav-activity-icon/);
  assert.match(navigation, /<span class="admin-nav-label">Activity<\/span>/);
  assert.doesNotMatch(navigation, /data-web-notification-unread/);
  assert.match(adminHtml, /data-coach-home-settings[\s\S]*?data-web-notification-unread/);
});

test("Activity keeps its feed visible and notification controls together in a disclosure", () => {
  const panelStart = adminHtml.indexOf('data-admin-panel="notifications"');
  const panelEnd = adminHtml.indexOf("</section>", panelStart);
  const settingsPanel = adminHtml.slice(panelStart, panelEnd);

  assert.ok(panelStart >= 0);
  assert.match(settingsPanel, /<h2 id="coach-notification-title" tabindex="-1">Activity<\/h2>/);
  assert.match(settingsPanel, /<summary>Notification settings<\/summary>/);
  assert.match(settingsPanel, /data-web-notification-summary="unread"/);
  assert.match(settingsPanel, /data-web-notification-summary="workouts"/);
  assert.match(settingsPanel, /data-web-notification-summary="checkins"/);
  assert.match(settingsPanel, /<h3 id="coach-notification-inbox-title">Recent activity<\/h3>/);
  assert.match(settingsPanel, /coach-notification-inbox-count[^>]*data-web-notification-unread[^>]*hidden/);
  assert.match(settingsPanel, /data-web-notification-enable/);
  assert.match(settingsPanel, /data-web-notification-test[^>]*disabled/);
  assert.match(settingsPanel, /data-web-notification-status[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(settingsPanel, /data-web-notification-list[^>]*aria-live="polite"/);
  assert.match(settingsPanel, /data-web-notification-empty/);
  assert.match(settingsPanel, /data-web-notification-mark-all[^>]*hidden/);
  assert.match(settingsPanel, /data-web-notification-mark-all[\s\S]*?<span>Mark read<\/span>/);
  assert.ok(
    settingsPanel.indexOf('id="coach-notification-inbox-title"') < settingsPanel.indexOf("data-web-notification-enable"),
    "Alert controls should appear below recent activity"
  );
  assert.ok(
    settingsPanel.indexOf("data-web-notification-test") < settingsPanel.indexOf('id="coach-notification-settings-title"'),
    "Alert controls should appear before notification preferences"
  );
  assert.ok(settingsPanel.indexOf("data-coach-notification-close") < settingsPanel.indexOf("coach-notification-heading"));
  assert.match(adminHtml, /src="js\/web-notifications\.js\?v=coach-activity-likes-5(?:&amp;[^"]*)?"[\s\S]*src="js\/coach-admin\.js\?[^"\s]+"/);
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
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-notification-close\s*\{[^}]*position:\s*absolute[^}]*top:\s*16px[^}]*right:\s*16px/s);
  assert.match(styleSource, /\.coach-notification-inbox \.web-notification-item\s*\{[^}]*border-radius:\s*16px/s);
  assert.match(styleSource, /\.coach-notification-inbox \.web-notification-like\s*\{[^}]*border-radius:\s*999px/s);
  assert.match(styleSource, /\.coach-notification-inbox \.web-notification-like\s*\{[^}]*width:\s*auto\s*!important/s);
  assert.match(styleSource, /\.coach-notification-inbox \.web-notification-like-icon\s*\{[^}]*font-size:\s*\.82rem\s*!important/s);
  assert.match(styleSource, /\.coach-notification-inbox \.web-notification-type-icon svg\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/s);
  assert.match(sharedSource, /activityDescriptor\.includes\("challenge"\)[\s\S]*?\? "challenge"/);
  assert.match(sharedSource, /notificationKind === "check_in_submitted"[\s\S]*?\? "checkin"/);
  assert.match(sharedSource, /notificationKind === "workout_completed"[\s\S]*?\? "workout"/);
  assert.match(styleSource, /\.coach-notification-inbox \.coach-notification-mark-all\s*\{[^}]*display:\s*inline-flex\s*!important[^}]*border-radius:\s*12px/s);
  assert.match(styleSource, /\.coach-notification-summary\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(darkStyleSource, /body\.coach-admin-page \.coach-notification-inbox \.web-notification-item\.is-unread\s*\{[^}]*background:\s*var\(--surface-soft\)/s);
  assert.match(darkStyleSource, /body\.coach-admin-page \.coach-notification-inbox \.web-notification-type-icon\s*\{[^}]*color:\s*var\(--lime\)/s);
});

test("mobile Home exposes Settings and recent activity in a dismissible overlay", () => {
  assert.match(adminHtml, /data-coach-home-settings[\s\S]*?data-web-notification-unread/);
  assert.match(adminHtml, /data-coach-notification-close/);
  assert.match(adminSource, /settingsButton\?\.addEventListener\("click", \(\) => openCoachActivity\(\{ settings: true \}\)\)/);
  assert.match(adminSource, /notificationClose\?\.addEventListener\("click"[\s\S]*?setAdminTab\("home"\)/);
  assert.match(styleSource, /\.admin-workspace\[data-active-tab="notifications"\]::before/);
  assert.match(styleSource, /\.coach-notification-panel:not\(\[hidden\]\)\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*1100/s);
  assert.match(styleSource, /@media \(max-width: 900px\)[\s\S]*?\.coach-notification-close\s*\{[^}]*width:\s*44px\s*!important[^}]*border-radius:\s*50%\s*!important/s);
});


test("matches coach activity by workout identity and keeps saved-only workouts read", () => {
  const window = {};
  vm.runInNewContext(sharedSource.replace("    createController,", "    combineCoachActivity,\n    createController,"), { window });
  const combine = window.FWBWebNotifications.combineCoachActivity;
  const sessions = [
    { client_email: "a@example.test", client_name: "Alex", session_id: "session-a", workout_title: "Upper Body", exercise_count: 5, completed_at: "2026-11-22T12:00:00Z" },
    { client_email: "b@example.test", client_name: "Sam", workout_session_id: "session-b", workout_title: "Lower Body", exercise_count: 1, completed_at: "2026-11-20T12:00:00Z" },
    { client_email: "c@example.test", client_name: "Jamie", entry_date: "2026-11-19", workout_title: "Strength", exercise_count: 2, completed_at: "2026-11-19T12:00:00Z" },
  ];
  const notifications = [
    { id: "check-in", kind: "check_in_submitted", created_at: "2026-11-23T12:00:00Z" },
    { id: "notice-a", kind: "workout_completed", dedupe_key: "workout:a@example.test:session-a", created_at: "2026-11-22T12:01:00Z", can_like: true },
    { id: "notice-c", kind: "workout_completed", dedupe_key: "workout:c@example.test:2026-11-19:Strength", created_at: "2026-11-19T12:01:00Z" },
  ];
  const rows = combine(notifications, sessions, (email) => `/coach-admin.html?tab=logs&client=${email[0]}`);
  assert.equal(rows.length, 4);
  assert.equal(rows[1].id, "notice-a");
  assert.equal(rows[1].body, "Upper Body · 5 exercises");
  assert.equal(rows[1].can_like, true);
  assert.equal(rows[1].read_at, undefined);
  assert.equal(rows[1].action_url, "/coach-admin.html?tab=logs&client=a");
  assert.equal(rows[2].body, "Lower Body · 1 exercise");
  assert.equal(rows[2].id, undefined);
  assert.equal(rows[2].read_at, sessions[1].completed_at);
  assert.equal(rows[3].id, "notice-c");
  const scopedRows = combine([
    { id: "other", kind: "workout_completed", metadata: { client_email: "b@example.test", session_id: "session-a" } }
  ], sessions.slice(0, 1), (email) => `/coach-admin.html?tab=logs&client=${email[0]}`);
  assert.equal(scopedRows.length, 2);
  assert.equal(scopedRows.find((row) => row.id === "other").coach_workout_email, "b@example.test");
  assert.equal(scopedRows.find((row) => !row.id).coach_workout_email, "a@example.test");
});
