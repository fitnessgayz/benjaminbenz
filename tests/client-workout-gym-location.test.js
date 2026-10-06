const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const portal = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = portal.indexOf("\nfunction ", start + 1);
  return portal.slice(start, end < 0 ? undefined : end);
}

test("previous exercise weights stay with the selected gym", () => {
  const history = [
    { exercise_name: "Chest Press", exercise_code: "A1", gym_name: "Gym A", entry_date: "2026-10-01", set_number: 1, weight_used: 100 },
    { exercise_name: "Chest Press", exercise_code: "A1", gym_name: "Gym B", entry_date: "2026-10-02", set_number: 1, weight_used: 150 },
    { exercise_name: "Chest Press", exercise_code: "A1", gym_name: null, entry_date: "2026-09-30", set_number: 1, weight_used: 80 }
  ];
  const names = ["normalizeWorkoutGymName", "sameWorkoutGym", "workoutGymLocationForElement",
    "logKey", "logsForExercise", "normalizeExerciseHistoryName", "currentExerciseHistoryName",
    "exerciseHistoryLookup", "logsForExerciseDisplay"];
  const api = Function("trainingLogs", "exerciseNameInputForLog", "warmupExerciseCode", "cardioExerciseCode",
    `${names.map(sourceForFunction).join("\n")}; return { logsForExerciseDisplay };`)(
    history, (log) => log.nameInput, "WU", "CARDIO"
  );
  const panel = { querySelector: () => ({ value: " gym a " }) };
  const log = {
    dataset: { exerciseName: "Chest Press" },
    nameInput: { value: "Chest Press" },
    closest: () => panel
  };

  assert.deepEqual(api.logsForExerciseDisplay(log).map((row) => row.weight_used), [100]);
  panel.querySelector = () => ({ value: "Gym B" });
  assert.deepEqual(api.logsForExerciseDisplay(log).map((row) => row.weight_used), [150]);
  panel.querySelector = () => ({ value: "Home" });
  assert.deepEqual(api.logsForExerciseDisplay(log), []);
});

test("the compact picker explains gym, home, and outdoor sessions", () => {
  const markup = Function("trainingLogs", "escapeHtml",
    `${sourceForFunction("normalizeWorkoutGymName")}\n${sourceForFunction("recentWorkoutGymLocations")}\n${sourceForFunction("workoutGymPickerMarkup")}; return workoutGymPickerMarkup("", 2);`)(
      [{ gym_name: "Gym A" }], (value) => String(value || "")
    );
  assert.match(markup, /Add gym location/);
  assert.match(markup, /train at different gyms/);
  assert.match(markup, /Home or Outdoors/);
  assert.match(markup, /option value="Gym A"/);
  assert.match(markup, /<button[^>]*data-find-nearby-gym[^>]*>Find nearby gyms<\/button>/);
});

test("a superset card lets the client choose the workout's gym without leaving the round", () => {
  const events = {};
  const calls = [];
  const attributes = new Map([["list", "gym-options"]]);
  const error = { hidden: true };
  const mirrorError = { hidden: true };
  const lockedHint = { hidden: true };
  const source = {
    value: "", readOnly: false, title: "",
    getAttribute: name => attributes.get(name) || null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name)
  };
  const mirror = {
    value: "", readOnly: false,
    setAttribute(name, value) { this[name] = value; },
    closest: selector => selector === ".custom-workout-grouped-gym"
      ? { querySelector: child => child === "[data-custom-grouped-gym-error]" ? mirrorError : lockedHint } : panel,
    scrollIntoView() { calls.push("scroll-mirror"); },
    focus() { calls.push("focus-mirror"); }
  };
  const panel = {
    querySelector: selector => selector === "[data-workout-gym-error]" ? error
      : selector === "[data-custom-grouped-gym]" ? mirror : source,
    querySelectorAll: selector => selector === "[data-custom-grouped-gym]" ? [mirror] : [{ id: "exercise" }]
  };
  const api = Function("document", "rememberWorkoutGymLocation", "persistCustomWorkoutDraftFromPanel",
    "renderPreviousExerciseWeights", "renderWorkoutProgression",
    `${["normalizeWorkoutGymName", "syncGroupedWorkoutGymInputs", "requireWorkoutGymLocation", "handleTrainingDateChange"]
      .map(sourceForFunction).join("\n")}; return { requireWorkoutGymLocation, handleTrainingDateChange };`)(
      { addEventListener(name, handler) { events[name] = handler; } },
      () => calls.push("remember"), () => calls.push("draft"),
      () => calls.push("weights"), () => calls.push("progression")
    );
  api.handleTrainingDateChange();
  assert.equal(api.requireWorkoutGymLocation(panel), false);
  assert.deepEqual(calls.slice(0, 2), ["scroll-mirror", "focus-mirror"]);
  assert.equal(mirrorError.hidden, false);

  mirror.value = "  Gym A  ";
  events.input({ target: { closest: selector => selector === "[data-custom-grouped-gym]" ? mirror : null } });
  assert.equal(source.value, "  Gym A  ");
  events.change({ target: { closest: selector => selector === "[data-custom-grouped-gym]" ? mirror : null } });
  assert.equal(source.value, "Gym A");
  assert.equal(mirror.value, "Gym A");
  assert.equal(mirrorError.hidden, true);
  assert.ok(calls.includes("weights") && calls.includes("progression"));
  assert.equal(api.requireWorkoutGymLocation(panel), true);
});

test("superset and circuit round cards both expose the gym location picker", () => {
  const render = Function("normalizeCustomWorkoutFormat", "workoutCarouselExerciseCode", "setCountFromPrescription",
    "customWorkoutGroupNameEditorMarkup", "escapeHtml", "customWorkoutCardMarkup", "customWorkoutInlineGroupOptionsMarkup",
    `${sourceForFunction("customWorkoutGroupedRoundCardMarkup")}; return customWorkoutGroupedRoundCardMarkup;`)(
      value => value, (_format, _group, index) => `A${index + 1}`, () => 3,
      () => "", value => String(value), () => "", () => ""
    );
  for (const format of ["superset", "circuit"]) {
    const markup = render(format, [{ name: "Squat" }, { name: "Row" }], 0, 0, "Custom workout", { panelFormat: format });
    assert.match(markup, /data-custom-grouped-gym/);
    assert.match(markup, /Choose a gym location before logging a round/);
    assert.match(markup, /data-custom-workout-format="(?:superset|circuit)"/);
  }
});
