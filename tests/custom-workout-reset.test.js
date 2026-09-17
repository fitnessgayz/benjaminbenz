const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("renders a compact reset action only inside the Custom Workout builder", () => {
  const customPanel = sourceForFunction("customWorkoutPanelMarkup");
  const assignedPanel = sourceForFunction("renderClientWorkoutTabs");

  assert.match(customPanel, /data-reset-custom-workout>Reset workout<\/button>/);
  assert.match(customPanel, /data-custom-workout-reset-status role="status" aria-live="polite"/);
  assert.doesNotMatch(assignedPanel, /data-reset-custom-workout/);
  assert.match(styles, /\.custom-workout-reset-control \{[\s\S]*?justify-content: flex-end;/);
  assert.match(styles, /\.custom-workout-reset-button \{[\s\S]*?min-height: 44px;[\s\S]*?color: var\(--red\) !important;/);
});

test("confirms destructive reset and creates a separate blank workout session", () => {
  const reset = sourceForFunction("resetCustomWorkout");
  const draft = sourceForFunction("freshCustomWorkoutDraft");
  const title = sourceForFunction("freshCustomWorkoutStorageTitle");

  assert.match(reset, /window\.confirm\([\s\S]*?Saved workout history will not be deleted/);
  assert.match(reset, /cancelTrainingLogAutosaves\(panel\)/);
  assert.match(reset, /clearCustomWorkoutDraft\(\)/);
  assert.match(reset, /activeCustomWorkoutFormat = "single"/);
  assert.match(reset, /storeCustomWorkoutFormat\("single"\)/);
  assert.match(reset, /storeCustomWorkoutDraft\(freshCustomWorkoutDraft\(\)\)/);
  assert.match(reset, /replaceCustomWorkoutPanelFromDraft\(panelIndex\)/);
  assert.match(reset, /New custom workout ready\./);
  assert.match(draft, /format: "single"/);
  assert.match(draft, /date: todayDate\(\)/);
  assert.match(draft, /exercises: \[\]/);
  assert.match(title, /\$\{customWorkoutTitle\} · New ·/);
});

test("ends only the matching Custom Workout timer and cancels pending autosaves", () => {
  const reset = sourceForFunction("resetCustomWorkout");
  const cancelAutosaves = sourceForFunction("cancelTrainingLogAutosaves");

  assert.match(reset, /currentWorkoutTitle === String\(workoutElapsedTimerState\.workoutTitle/);
  assert.match(reset, /if \(endsCurrentTimer\) \{[\s\S]*?finishWorkoutElapsedTimer\(\)/);
  assert.match(reset, /closeRestTimer\(\)/);
  assert.match(reset, /resetRestTimer\(\)/);
  assert.match(cancelAutosaves, /trainingLogAutosaveTimers\.get\(logElement\)/);
  assert.match(cancelAutosaves, /window\.clearTimeout\(timer\)/);
  assert.match(cancelAutosaves, /trainingLogAutosaveTimers\.delete\(logElement\)/);
});

test("wires the reset action and cache-busts its assets", () => {
  const interactions = sourceForFunction("handleWorkoutInteractions");

  assert.match(interactions, /event\.target\.closest\("\[data-reset-custom-workout\]"\)/);
  assert.match(interactions, /resetCustomWorkout\(resetCustomWorkoutButton\.closest\("\.client-workout-panel-custom"\)\)/);
  assert.match(dashboard, /css\/style\.css\?v=client-notification-settings-1/);
  assert.match(dashboard, /js\/client-portal\.js\?v=grouped-round-labels-1/);
});
