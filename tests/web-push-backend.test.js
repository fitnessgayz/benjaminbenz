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
const deployedEdgeFunction = fs.readFileSync(
  path.join(root, "supabase/functions/fwb-web-push/index.ts"),
  "utf8"
);
const coachWorkoutMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260917160557_enable_coach_workout_completion_notifications.sql"),
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

test("deployed push backend supports authenticated setup, tests, and coach workout alerts", () => {
  assert.match(config, /\[functions\.fwb-web-push\]\s*\nverify_jwt = false/);
  assert.match(deployedEdgeFunction, /input\.action === "public-key" \|\| input\.action === "test"/);
  assert.match(deployedEdgeFunction, /admin\.auth\.getUser\(token\)/);
  assert.match(deployedEdgeFunction, /from\("fwb_web_push_subscriptions"\)/);
  assert.match(deployedEdgeFunction, /web_dedupe_key:\s*`web-push-test:/);
  assert.match(deployedEdgeFunction, /body:\s*"Open FWB to view your update\."/);
  assert.match(deployedEdgeFunction, /title:\s*safePushTitle\(category\)/);
  assert.doesNotMatch(deployedEdgeFunction, /title:\s*notification\.title/);
  assert.match(deployedEdgeFunction, /requireMutation\([\s\S]*?Could not finalize push delivery/);
  assert.match(deployedEdgeFunction, /Could not schedule a push retry/);
  assert.match(coachWorkoutMigration, /workout_completed/);
  assert.match(coachWorkoutMigration, /client_workout_completed/);
  assert.match(coachWorkoutMigration, /push_enabled = true/);
});
