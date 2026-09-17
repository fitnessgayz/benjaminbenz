const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260917124828_add_web_push_notifications.sql"),
  "utf8"
);
const edgeFunction = fs.readFileSync(
  path.join(root, "supabase/functions/send-web-push/index.ts"),
  "utf8"
);
const config = fs.readFileSync(path.join(root, "supabase/config.toml"), "utf8");

test("web-push tables use explicit RLS, grants, and account-safe endpoint ownership", () => {
  for (const table of [
    "client_notifications",
    "client_notification_preferences",
    "web_push_subscriptions",
    "notification_dispatch_config"
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"));
  }

  assert.match(migration, /create unique index if not exists web_push_subscriptions_endpoint_idx/i);
  assert.match(migration, /prior_subscription\.p256dh <> new\.p256dh[\s\S]*prior_subscription\.auth <> new\.auth/);
  assert.doesNotMatch(migration, /grant insert, delete on table public\.client_notifications/i);
  assert.match(migration, /action_url !~ '\^\/\/'/);
});

test("high-signal client and coach events are queued without using historical sessions as appointments", () => {
  for (const source of [
    "after insert or update on public.client_programs",
    "after insert on public.workout_comments",
    "after insert or update of status, coach_feedback on public.form_check_submissions"
  ]) {
    assert.match(migration.toLowerCase(), new RegExp(source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(migration, /new\.nutrition_plan is distinct from old\.nutrition_plan/);
  assert.match(edgeFunction, /kind: "nutrition_activity"/);
  assert.doesNotMatch(edgeFunction, /program\.session_dates|session_dates\.includes/);
});

test("push delivery is generic, retry-safe, and cron uses custom authorization", () => {
  assert.match(edgeFunction, /const safeCopy = pushCopy\(row\)/);
  assert.match(edgeFunction, /title: safeCopy\.title[\s\S]*body: safeCopy\.body/);
  assert.doesNotMatch(edgeFunction, /title: row\.title[\s\S]*body: row\.body/);
  assert.match(edgeFunction, /\.eq\("push_attempt_count", Number\(row\.push_attempt_count \|\| 0\)\)/);
  assert.match(edgeFunction, /Wait a minute before sending another test alert/);
  assert.match(migration, /X-FWB-Dispatch-Secret/);
  assert.match(migration, /vault\.decrypted_secrets/);
  assert.match(config, /\[functions\.send-web-push\]\s*\nverify_jwt = false/);
});
