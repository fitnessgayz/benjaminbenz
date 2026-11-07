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

test("Training preferences keeps rest and check-in choices", () => {
  assert.match(dashboard, /data-client-settings-open="training-preferences"/);
  const detail = dashboard.match(/<section[^>]*data-client-settings-view="training-preferences"[\s\S]*?<\/section>/)?.[0];
  assert.ok(detail);
  for (const control of ["data-auto-rest-timer", "data-daily-checkin-prompt"]) {
    assert.match(detail, new RegExp(control));
  }
  assert.doesNotMatch(detail, /data-workout-timer-auto-show/);
  assert.match(detail, /data-client-settings-open="notifications"/);
  assert.match(dashboard, /data-web-notification-preference="weekly_check_ins"/);
});

test("workout duration tracks while the floating timer starts hidden", () => {
  const start = Function("workoutElapsedTimerClientEmail", "readWorkoutElapsedTimerState", "activeWorkoutElapsedTitle",
    "todayDate", "persistWorkoutElapsedTimerState", "runWorkoutElapsedTimer", "Date",
    `let workoutElapsedTimerState = null; ${declaration("startWorkoutElapsedTimer")}; return () => {
      startWorkoutElapsedTimer("Strength", { workoutDate: "2026-10-04", panelIndex: 0 });
      return workoutElapsedTimerState;
    };`
  )(() => "client@example.com", () => null, () => "Strength", () => "2026-10-04",
    () => {}, () => {}, Date);
  const state = start();
  assert.equal(state.running, true);
  assert.equal(state.dismissed, true);
  assert.match(declaration("restoreWorkoutElapsedTimer"), /workoutElapsedTimerState\.dismissed = true/);
  assert.match(declaration("resumeActiveWorkout"), /workoutElapsedTimerState\.dismissed = true/);
  assert.match(declaration("showWorkoutElapsedTimer"), /workoutElapsedTimerState\.dismissed = false/);
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
