const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(projectRoot, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(projectRoot, "js/coach-admin.js"), "utf8");
const functionSource = fs.readFileSync(path.join(projectRoot, "supabase/functions/coach-calendar-events/index.ts"), "utf8");
const supabaseConfig = fs.readFileSync(path.join(projectRoot, "supabase/config.toml"), "utf8");

test("FWB Calendar feed stays server-side and requires a verified coach", () => {
  assert.match(supabaseConfig, /\[functions\.coach-calendar-events\]\s+verify_jwt = true/);
  assert.match(functionSource, /Deno\.env\.get\("FWB_CALENDAR_ICAL_URL"\)/);
  assert.match(functionSource, /auth\.getUser\(token\)/);
  assert.match(functionSource, /coachEmails\(\)\.includes\(callerEmail\)/);
  assert.match(functionSource, /url\.hostname === "calendar\.google\.com"/);
  assert.match(functionSource, /redirect: "error"/);
  assert.doesNotMatch(functionSource, /private-[a-z0-9]+/i);
  assert.doesNotMatch(adminHtml, /private-[a-z0-9]+/i);
});

test("calendar feed is bounded and returns only display-safe event fields", () => {
  assert.match(functionSource, /maxCalendarBytes = 5 \* 1024 \* 1024/);
  assert.match(functionSource, /maxCalendarEvents = 500/);
  assert.match(functionSource, /maxRangeDays = 184/);
  assert.match(functionSource, /setTimeout\(\(\) => controller\.abort\(\), 10000\)/);
  assert.match(functionSource, /title,\s+start: start\.toISOString\(\),\s+end: end\.toISOString\(\),\s+all_day:/s);
  assert.doesNotMatch(functionSource, /description:\s/);
  assert.doesNotMatch(functionSource, /attendees:\s/);
});

test("Coach Home syncs FWB events with time, cancellation, refresh, and fallback", () => {
  assert.match(adminSource, /functions\.invoke\("coach-calendar-events"/);
  assert.match(adminSource, /coachCalendarTimeZone = "America\/Los_Angeles"/);
  assert.match(adminSource, /coachHomeSavedSessionEntries\(\)/);
  assert.match(adminSource, /entry\.canceled \? "Canceled"/);
  assert.match(adminSource, /formatCoachCalendarEventTime\(entry\)/);
  assert.match(adminSource, /loadCoachCalendarEvents\(\{ force: true \}\)/);
  assert.match(adminHtml, /FWB Calendar/);
  assert.match(adminHtml, /calendar\.google\.com\/calendar\/u\/0\/r\?cid=/);
});
