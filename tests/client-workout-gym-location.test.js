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

test("recent exercise recommendations keep each gym's own sets and skip unrelated exercises", () => {
  const history = [
    { exercise_name: "Bench Press", gym_name: "Gym A", entry_date: "2026-10-01", session_id: "a", set_type: "working", set_number: 1, weight_used: 100, reps: 10 },
    { exercise_name: "Bench Press", gym_name: "Gym A", entry_date: "2026-10-01", session_id: "a", set_type: "working", set_number: 2, weight_used: 105, reps: 8 },
    { exercise_name: "Bench Press", gym_name: "Gym B", entry_date: "2026-10-03", session_id: "b", set_type: "working", set_number: 1, weight_used: 150, reps: 6 },
    { exercise_name: "Bench Press", gym_name: null, entry_date: "2026-09-30", session_id: "old", set_type: "working", set_number: 1, weight_used: 85, reps: 12 },
    { exercise_name: "Archer Push-Up", gym_name: "Gym A", entry_date: "2026-10-05", session_id: "other", set_type: "working", set_number: 1, weight_used: 205, reps: 15 }
  ];
  const names = ["normalizeWorkoutGymName", "workoutGymLocationForElement", "normalizeExerciseHistoryName",
    "currentExerciseHistoryName", "exerciseHistoryLookup", "recentExerciseHistoryByGym"];
  const api = Function("trainingLogs", "exerciseNameInputForLog", "warmupExerciseCode", "cardioExerciseCode",
    "normalizedSetType", "workingSetType", "todayDate",
    `${names.map(sourceForFunction).join("\n")}; return { recentExerciseHistoryByGym };`)(
      history, (log) => log.nameInput, "WU", "CARDIO", (type) => type, "working", () => "2026-10-29"
    );
  const panel = { querySelector: () => ({ value: "Gym A" }) };
  const log = { dataset: { exerciseName: "Bench Press" }, nameInput: { value: "Bench Press" },
    querySelector: () => ({ value: "2026-10-29" }), closest: () => panel };
  const results = api.recentExerciseHistoryByGym(log);
  assert.deepEqual(results.map((item) => item.gym), ["Gym A", "Gym B", ""]);
  assert.deepEqual(results[0].rows.map((row) => row.weight_used), [100, 105]);
  assert.deepEqual(results[1].rows.map((row) => row.weight_used), [150]);
  log.nameInput.value = "Never Done";
  assert.deepEqual(api.recentExerciseHistoryByGym(log), []);
});

test("the compact picker keeps a single gym, home, or outdoor input", () => {
  const markup = Function("trainingLogs", "escapeHtml",
    `${sourceForFunction("normalizeWorkoutGymName")}\n${sourceForFunction("recentWorkoutGymLocations")}\n${sourceForFunction("workoutGymPickerMarkup")}; return workoutGymPickerMarkup("", 2);`)(
      [{ gym_name: "Gym A" }], (value) => String(value || "")
    );
  assert.match(markup, /Add gym location/);
  assert.match(markup, /Gym name, Home, or Outdoors/);
  assert.match(markup, /option value="Gym A"/);
  assert.doesNotMatch(markup, /Find nearby gyms|Choose once before you start/);
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
