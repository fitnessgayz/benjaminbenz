const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migrations = path.join(root, "supabase/migrations");
const filename = fs.readdirSync(migrations).find((name) => name.endsWith("_add_message_push_notifications.sql"));
const migration = fs.readFileSync(path.join(migrations, filename), "utf8");

test("new chat messages queue generic client and coach notifications", () => {
  assert.match(migration, /create trigger message_push_notification[\s\S]*after insert on messaging_private\.messages/i);
  assert.match(migration, /notification_category := 'client_message'/);
  assert.match(migration, /destination := '\/coach-admin\.html\?tab=inbox'/);
  assert.match(migration, /notification_category := 'coach_reply'/);
  assert.match(migration, /destination := '\/client-dashboard\.html\?messages=1'/);
  assert.match(migration, /'Open FWB Training to read and reply\.'/);
  assert.doesNotMatch(migration, /new\.body/);
});

test("notification recipients are verified and message retries cannot duplicate alerts", () => {
  assert.match(migration, /account\.email_confirmed_at is not null/);
  assert.match(migration, /account\.deleted_at is null/);
  assert.match(migration, /not coalesce\(account\.is_anonymous, false\)/);
  assert.match(migration, /account\.banned_until is null or account\.banned_until <= now\(\)/);
  assert.match(migration, /'coach-message:' \|\| new\.id::text \|\| ':' \|\| recipient\.id::text/);
  assert.match(migration, /on conflict \(user_id, web_dedupe_key\)[\s\S]*do nothing/);
  assert.match(migration, /on conflict \(user_id, dedupe_key\)[\s\S]*do nothing/);
});

test("push activation does not enable or modify email delivery", () => {
  assert.doesNotMatch(migration, /email_dispatch_config|send-message-email|fwb-messaging-email-dispatch|cron\.alter_job/i);
  assert.match(migration, /revoke all on function messaging_private\.enqueue_message_push_notification\(\)/);
});
