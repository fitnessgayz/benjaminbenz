import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260926162410_add_native_apns_delivery.sql", import.meta.url),
  "utf8"
);
const worker = readFileSync(
  new URL("../supabase/functions/fwb-native-push/index.ts", import.meta.url),
  "utf8"
);
const splitMigration = readFileSync(
  new URL("../supabase/migrations/20261002051621_allow_separate_client_coach_native_push.sql", import.meta.url),
  "utf8"
);

test("separate native client and coach bundles preserve push ownership and privileges", () => {
  assert.match(splitMigration, /device\.bundle_identifier in\s*\(\s*'com\.benjaminbenz\.fwbcoach',\s*'com\.benjaminbenz\.fwb'\s*\)/);
  assert.match(splitMigration, /device\.user_id = new\.user_id/);
  assert.match(splitMigration, /device\.platform = 'ios'/);
  assert.match(splitMigration, /device\.is_active is true/);
  assert.match(splitMigration, /set search_path = ''/);
  assert.match(splitMigration, /on conflict \(notification_id, device_id\) do nothing/);
  assert.match(splitMigration, /revoke all on function private\.fwb_enqueue_native_push\(\) from public, anon, authenticated/);
  assert.match(worker, /"apns-topic": job\.bundle_identifier/);
});

test("native jobs are scoped to the notification owner and active FWB iOS devices", () => {
  assert.match(migration, /device\.user_id = new\.user_id/);
  assert.match(migration, /device\.is_active is true/);
  assert.match(migration, /device\.bundle_identifier = 'com\.benjaminbenz\.fwbcoach'/);
  assert.match(migration, /device\.user_id = notification\.user_id/);
});

test("native push payloads use generic copy and never load message bodies", () => {
  assert.doesNotMatch(worker, /notification_body|message_body|\.body\b/);
  assert.match(worker, /Open FWB Training to read and reply\./);
  assert.match(worker, /notification_id: job\.notification_id/);
});

test("native push worker requires private authorization and protected APNs secrets", () => {
  assert.match(worker, /requestToken !== config\.fwb_push_worker_token/);
  assert.match(worker, /Deno\.env\.get\("APNS_TEAM_ID"\)/);
  assert.match(worker, /Deno\.env\.get\("APNS_KEY_ID"\)/);
  assert.match(worker, /Deno\.env\.get\("APNS_PRIVATE_KEY"\)/);
});

test("invalid APNs device tokens are deactivated", () => {
  assert.match(worker, /BadDeviceToken/);
  assert.match(worker, /DeviceTokenNotForTopic/);
  assert.match(worker, /Unregistered/);
  assert.match(worker, /update\(\{ is_active: false \}\)/);
});
