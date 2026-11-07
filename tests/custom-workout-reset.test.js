const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const launcherStyles = fs.readFileSync(path.join(root, "css/client-custom-workout-launcher.css"), "utf8");
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

  assert.match(customPanel, /data-reset-custom-workout>Reset<\/button>/);
  assert.match(customPanel, /data-custom-workout-reset-status role="status" aria-live="polite"/);
  assert.doesNotMatch(assignedPanel, /data-reset-custom-workout/);
  assert.match(customPanel, /class="custom-workout-primary-actions"[\s\S]*data-custom-workout-start-control[\s\S]*data-reset-custom-workout/);
  assert.doesNotMatch(customPanel, /class="custom-workout-launcher-menu"/);
  assert.match(dashboard, /client-custom-workout-launcher\.css\?v=7/);
  assert.match(launcherStyles, /\.custom-workout-primary-actions\s*\{[^}]*display: flex;/);
});

test("uses the exercise-first launcher without a separate warm-up section", () => {
  const customPanel = sourceForFunction("customWorkoutPanelMarkup");
  const exerciseControls = sourceForFunction("syncCustomWorkoutExerciseControls");

  assert.match(customPanel, /class="custom-workout-launcher-exercise-card"/);
  assert.match(customPanel, /<h3>Your exercises<\/h3><p>Build as you go\.<\/p>/);
  assert.ok(customPanel.indexOf("customWorkoutFormatPickerMarkup()") < customPanel.indexOf("data-custom-workout-launcher-add"));
  assert.match(customPanel, /data-custom-workout-launcher-add-label>Add first exercise/);
  assert.match(customPanel, /Build your workout as you go/);
  assert.doesNotMatch(customPanel, /warmupLogFields\(/);
  assert.ok(customPanel.indexOf("data-custom-workout-launcher-add-label") < customPanel.indexOf("customWorkoutCarouselMarkup(format, workoutStorageTitle)"));
  assert.ok(customPanel.indexOf("data-custom-workout-footer-add") > customPanel.indexOf("customWorkoutCarouselMarkup(format, workoutStorageTitle)"));
  assert.match(exerciseControls, /firstExerciseButton\.hidden = count > 0/);
  assert.match(exerciseControls, /anotherExerciseButton\.hidden = count === 0/);
  assert.match(launcherStyles, /\.custom-workout-footer-add\[hidden\][^\{]*\{\s*display: none/);
  assert.match(dashboard, /web-parity=11/);
});

test("keeps gym selection visible on the exercise-first starter", () => {
  const customPanel = sourceForFunction("customWorkoutPanelMarkup");
  const gym = sourceForFunction("requireWorkoutGymLocation");

  assert.match(customPanel, /<div class="custom-workout-launcher-gym">\$\{workoutGymPickerMarkup\(/);
  assert.ok(customPanel.indexOf('class="custom-workout-launcher-gym"') < customPanel.indexOf('class="custom-workout-builder"'));
  assert.doesNotMatch(gym, /input\.closest\("\.custom-workout-launcher-more"\)/);
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
  assert.match(dashboard, /css\/style\.css\?v=[^"\s]*workout-preview-1/);
  assert.match(dashboard, /js\/client-portal\.js\?v=[^"\s]*workout-preview-1/);
});

test("mobile workout bar keeps Reset behind More after starting, for custom and prescribed logs", () => {
  const barMarkup = Function(`${sourceForFunction("floatingWorkoutFinishMarkup")}; return floatingWorkoutFinishMarkup;`)();
  const customBar = barMarkup();
  const assignedBar = barMarkup({ assigned: true });

  for (const markup of [customBar, assignedBar]) {
    assert.match(markup, /data-floating-workout-reset-action[^>]*>Reset<\/button>/);
    assert.match(markup, /data-floating-workout-start-action>Start workout<\/button>/);
    assert.match(markup, /data-floating-workout-more hidden>[\s\S]*More workout actions/);
    assert.match(markup, /data-floating-workout-finish-action[^>]*hidden>Save &amp; finish workout<\/button>/);
  }
  assert.match(customBar, /data-reset-custom-workout/);
  assert.match(assignedBar, /data-reset-assigned-workout/);
  assert.match(sourceForFunction("handleWorkoutInteractions"), /resetAssignedWorkout\(resetAssignedWorkoutButton\.closest/);
});

test("resetting a prescribed log confirms, clears its timer, and reopens a fresh panel", () => {
  const reset = sourceForFunction("resetAssignedWorkout");
  const calls = [];
  const panel = { querySelectorAll: () => [], querySelector: (selector) => selector === "[data-workout-start]"
    ? { dataset: { workoutTitle: "Trainer Workout" } }
    : selector === "[data-workout-date]" ? { value: "2026-11-07" } : null };
  const document = { querySelectorAll: () => [panel] };
  const window = { confirm: () => false };
  const fixture = Function("window", "document", "calls", `
    let workoutElapsedTimerState = { workoutTitle: "Trainer Workout", workoutDate: "2026-11-07" };
    const currentProgram = { workouts: ["prescription"] };
    const todayDate = () => "2026-11-07";
    const cancelTrainingLogAutosaves = () => calls.push("autosaves");
    const finishWorkoutElapsedTimer = () => calls.push("timer");
    const renderClientWorkoutTabs = () => calls.push("render");
    const activateClientWorkoutPanel = () => calls.push("activate");
    const syncWorkoutPanelDate = () => calls.push("date");
    const updateExerciseLogField = () => calls.push("log");
    const syncWorkoutGymLock = () => calls.push("gym");
    ${reset}
    return resetAssignedWorkout;
  `)(window, document, calls);

  assert.equal(fixture(panel), null);
  assert.deepEqual(calls, []);
  window.confirm = () => true;
  assert.equal(fixture(panel), panel);
  assert.deepEqual(calls, ["autosaves", "timer", "render", "activate", "date", "gym"]);
  assert.match(reset, /Sets already saved will stay in your history/);
});
