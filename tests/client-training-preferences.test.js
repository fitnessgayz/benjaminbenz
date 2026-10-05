const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");

function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}

test("Training preferences groups the existing rest control with timer and check-in choices", () => {
  assert.match(dashboard, /data-client-settings-open="training-preferences"/);
  const detail = dashboard.match(/<section[^>]*data-client-settings-view="training-preferences"[\s\S]*?<\/section>/)?.[0];
  assert.ok(detail);
  for (const control of ["data-auto-rest-timer", "data-workout-timer-auto-show", "data-daily-checkin-prompt"]) {
    assert.match(detail, new RegExp(control));
  }
  assert.match(detail, /data-client-settings-open="notifications"/);
  assert.match(dashboard, /data-web-notification-preference="weekly_check_ins"/);
});

test("workout timer visibility preference keeps elapsed tracking and restores the default", () => {
  const storage = new Map();
  const window = { localStorage: { getItem: key => storage.get(key) ?? null } };
  const enabled = Function("window", "workoutTimerAutoShowStorageKey", "workoutTimerAutoShowFallback",
    `${declaration("clientTrainingPreferenceEnabled")}; ${declaration("workoutTimerAutoShowEnabled")}; return workoutTimerAutoShowEnabled;`
  )(window, "workout-auto-show", true);
  assert.equal(enabled(), true);
  storage.set("workout-auto-show", "false");
  assert.equal(enabled(), false);

  let state;
  const start = Function("workoutElapsedTimerClientEmail", "readWorkoutElapsedTimerState", "activeWorkoutElapsedTitle",
    "todayDate", "workoutTimerAutoShowEnabled", "persistWorkoutElapsedTimerState", "runWorkoutElapsedTimer", "Date",
    `let workoutElapsedTimerState = null; ${declaration("startWorkoutElapsedTimer")}; return (visible) => {
      startWorkoutElapsedTimer("Strength", { workoutDate: "2026-10-04", panelIndex: 0 });
      return workoutElapsedTimerState;
    };`
  )(() => "client@example.com", () => null, () => "Strength", () => "2026-10-04", enabled,
    () => {}, () => {}, Date);
  state = start();
  assert.equal(state.running, true);
  assert.equal(state.dismissed, true);
  storage.set("workout-auto-show", "true");
  state = start();
  assert.equal(state.dismissed, false);
});

test("daily check-in preference defaults on and can disable the automatic prompt", () => {
  const storage = new Map();
  const window = { localStorage: { getItem: key => storage.get(key) ?? null } };
  const enabled = Function("window", "dailyCheckinPromptStorageKey", "dailyCheckinPromptFallback",
    `${declaration("clientTrainingPreferenceEnabled")}; ${declaration("dailyCheckinPromptEnabled")}; return dailyCheckinPromptEnabled;`
  )(window, "daily-prompt", true);
  assert.equal(enabled(), true);
  storage.set("daily-prompt", "false");
  assert.equal(enabled(), false);
});
