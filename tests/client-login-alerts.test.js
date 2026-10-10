const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("only explicit client password sign-ins request a coach alert", () => {
  const portal = read("js/client-portal.js");
  const login = portal.slice(portal.indexOf("async function handleLogin()"), portal.indexOf("async function handleCoachPortalLogin()"));
  const restore = portal.slice(portal.indexOf("async function restorePortalLogin()"), portal.indexOf("async function handleLogin()"));
  assert.match(login, /await signInToPortal\(form\)/);
  assert.match(login, /!isCoachPortalEmail\(data\.user\?\.email\)/);
  assert.match(login, /supabaseClient\.rpc\("record_client_login_notification"\)/);
  assert.ok(login.indexOf('rpc("record_client_login_notification")') < login.indexOf("window.location.href = portalLoginDestination"));
  assert.doesNotMatch(restore, /record_client_login_notification/);
});

test("the server derives the client and coach from auth and deduplicates one sign-in", () => {
  const migration = read("supabase/migrations/20261010194000_client_login_alerts.sql");
  assert.match(migration, /signed_in_user_id uuid := auth\.uid\(\)/);
  assert.match(migration, /user_record\.last_sign_in_at/);
  assert.match(migration, /signed_in_at < now\(\) - interval '3 minutes'/);
  assert.match(migration, /program\.active is true/);
  assert.match(migration, /on conflict \(user_id, web_dedupe_key\).*do nothing/);
  assert.match(migration, /on conflict \(user_id, dedupe_key\).*do nothing/);
});

test("coach can control login browser alerts and lock-screen copy omits the name", () => {
  const coach = read("coach-admin.html");
  const preferences = read("js/web-notifications.js");
  const push = read("supabase/functions/fwb-web-push/index.ts");
  assert.match(coach, /data-web-notification-preference="client_logins" checked/);
  assert.match(preferences, /client_logins: "client_login"/);
  assert.match(push, /client_login: "Client signed in"/);
  assert.match(push, /if \(category === "client_login"\) \{\s*return "Open Coach Admin to see which client signed in\."/);
});
