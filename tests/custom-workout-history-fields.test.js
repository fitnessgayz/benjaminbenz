const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const portal = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name} to exist`);
  const end = portal.indexOf("\nfunction ", start + 1);
  return portal.slice(start, end < 0 ? undefined : end);
}

function fixture(format = "single", assigned = false) {
  const input = () => ({
    value: "", placeholder: "", dataset: { defaultPlaceholder: "0" }, attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; }
  });
  const row = (number = 1) => ({
    dataset: { setNumber: String(number), setType: "working" },
    fields: { weight: input(), reps: input() },
    classList: { contains: () => false, toggle: () => {} },
    querySelector(selector) { return this.fields[selector.match(/data-set-(weight|reps)/)?.[1]] || null; }
  });
  const log = (name) => ({
    dataset: {}, nameInput: { value: name }, rows: [row()], dateInput: { value: "2026-09-18" },
    closest(selector) {
      if (selector === "[data-custom-exercise-card]") return {};
      if (selector === "[data-custom-workout-grouped='true']") return carousel;
      return null;
    },
    querySelector(selector) { return selector === "[data-log-date]" ? this.dateInput : null; },
    querySelectorAll() { return this.rows; }
  });
  const visibleRow = (index, number = 1) => ({
    dataset: { customGroupedExerciseIndex: String(index), customGroupedSetNumber: String(number), customGroupedSetType: "working" },
    fields: { weight: input(), reps: input(), rir: input() },
    querySelector(selector) { return this.fields[selector.match(/data-custom-grouped-field="(\w+)"/)?.[1]] || null; }
  });
  const sections = { innerHTML: "" };
  const carousel = {
    dataset: { customWorkoutFormat: format, ...(assigned ? { assignedWorkoutCarousel: "" } : {}) },
    logs: [log("Bench Press"), log("Squat")],
    visibleRows: [visibleRow(0), visibleRow(1)],
    querySelector(selector) {
      if (selector === "[data-custom-grouped-sections]") return sections;
      if (selector === "[data-custom-workout-list]") return { children: cards };
      return null;
    },
    querySelectorAll(selector) {
      const index = selector.match(/data-custom-grouped-exercise-index="(\d+)"/)?.[1];
      return this.visibleRows.filter((row) => row.dataset.customGroupedExerciseIndex === index);
    }
  };
  const cards = carousel.logs.map((log) => ({
    dataset: assigned ? { customExerciseCard: "", assignedExerciseCard: "" } : { customExerciseCard: "" },
    matches: (selector) => selector === "[data-custom-exercise-card]",
    querySelector: () => log
  }));
  const history = [
    { exercise_name: "  BENCH press ", exercise_code: "A1", entry_date: "2026-09-10", set_number: 1, weight_used: 135, reps: 8 },
    { exercise_name: "Bench Press", exercise_code: "A1", entry_date: "2026-09-18", set_number: 1, weight_used: 200, reps: 3 },
    { exercise_name: "Bench Press", exercise_code: "A1", entry_date: "2026-09-19", set_number: 1, weight_used: 225, reps: 2 },
    { exercise_name: "Squat", exercise_code: "B1", entry_date: "2026-09-12", set_number: 1, weight_used: 0, reps: 12 }
  ];
  const functions = [
    "normalizeExerciseHistoryName", "currentExerciseHistoryName", "logsForExerciseDisplay",
    "logKey", "logsForExercise", "updateExerciseLogField", "renderPreviousExerciseWeights",
    "normalizedSetType", "setTypeForRow", "customWorkoutGroupedRows", "customWorkoutGroupedCanonicalRow",
    "customWorkoutCarouselCards", "customWorkoutGroupedLogElements",
    "latestPreviousSetLogs", "personalBestWeightLog", "historyPlaceholder", "updateSetHistoryPlaceholders",
    "syncCustomWorkoutGroupedHistoryPlaceholders", "setRowInputValues",
    "customWorkoutGroupedFieldMarkup", "customWorkoutGroupedSetRowMarkup", "renderCustomWorkoutGroupedCard"
  ];
  const dependencies = {
    trainingLogs: history, warmupExerciseCode: "WU", cardioExerciseCode: "CARDIO",
    warmUpSetType: "warm_up", workingSetType: "working", warmUpSetNumberBase: 1000,
    formatLogDate: (date) => date, todayDate: () => "2026-09-18", exerciseNameInputForLog: (log) => log.nameInput,
    escapeHtml: (value) => String(value ?? "").replaceAll('"', "&quot;"),
    normalizeCustomWorkoutGroupedRoundRows: () => false,
    renderCustomWorkoutGroupedExerciseKey: () => {}, syncCustomWorkoutGroupedRoundStepper: () => {},
    refreshCustomWorkoutGroupedCompletion: () => {}, renderCustomWorkoutGroupedTimerPanels: () => {},
    renderCustomWorkoutGroupedRestControls: () => {},
    restoreStrengthSetRows: () => {}, renderSetRirValue: () => {}, renderExerciseNotesState: () => {},
    syncExerciseNamePreview: () => {}, updateVisibleSetProgress: () => {}, syncExerciseFinishedState: () => {}
  };
  const api = Function(...Object.keys(dependencies), `
    ${functions.map(sourceForFunction).join("\n")}
    function customWorkoutGroupedSectionsMarkup(carousel) {
      return carousel.logs.map((log, index) => log.rows.map((row) =>
        customWorkoutGroupedSetRowMarkup(row, 'A1', index, 'working', 1, log.nameInput.value)
      ).join('')).join('');
    }
    return { updateSetHistoryPlaceholders, renderCustomWorkoutGroupedCard, personalBestWeightLog, logsForExerciseDisplay, updateExerciseLogField };
  `)(...Object.values(dependencies));
  return { ...api, carousel, sections, row, visibleRow, history };
}

for (const assigned of [false, true]) {
 for (const format of ["single", "superset", "circuit"]) {
  test(`${assigned ? "assigned" : "custom"} ${format}: initial render and added sets show all-time personal-best weight with previous reps as hints`, () => {
    const f = fixture(format, assigned);
    f.renderCustomWorkoutGroupedCard(f.carousel);
    assert.match(f.sections.innerHTML, /value=""\s+placeholder="225"\s+data-custom-grouped-field="weight"/);
    assert.match(f.sections.innerHTML, /value=""\s+placeholder="8"\s+data-custom-grouped-field="reps"/);
    assert.match(f.sections.innerHTML, /placeholder="0"\s+data-custom-grouped-field="weight"/);
    f.carousel.logs[0].rows.push(f.row(2));
    f.renderCustomWorkoutGroupedCard(f.carousel);
    assert.equal((f.sections.innerHTML.match(/placeholder="225"/g) || []).length, 2);
    assert.equal(f.carousel.logs[0].rows[1].fields.weight.value, "");
  });
 }
}

test("assigned workout markup uses the same history-aware exercise cards and grouped renderer", () => {
  assert.match(sourceForFunction("exerciseCard"), /data-custom-exercise-card data-assigned-exercise-card/);
  assert.match(sourceForFunction("assignedWorkoutCarouselMarkup"), /customWorkoutCarouselGroupMarkup[\s\S]*assigned: true/);
  assert.match(sourceForFunction("customWorkoutCarouselGroupMarkup"), /return customWorkoutGroupedRoundCardMarkup/);
});

test("changing exercise updates only its visible hints and preserves entered values and RIR", () => {
  const f = fixture("superset");
  const [bench, squat] = f.carousel.logs;
  const [visibleBench, visibleSquat] = f.carousel.visibleRows;
  visibleBench.fields.weight.value = "140";
  visibleBench.fields.reps.value = "6";
  visibleBench.fields.rir.value = "2";
  bench.rows[0].fields.weight.value = "140";
  f.updateSetHistoryPlaceholders(bench);
  assert.equal(visibleBench.fields.weight.placeholder, "225");
  assert.equal(visibleBench.fields.reps.placeholder, "8");
  assert.equal(visibleSquat.fields.weight.placeholder, "");
  f.updateSetHistoryPlaceholders(squat);
  assert.equal(visibleSquat.fields.weight.placeholder, "0");
  assert.equal(visibleSquat.fields.reps.placeholder, "12");
  bench.nameInput.value = "New exercise with no history";
  f.updateSetHistoryPlaceholders(bench);
  assert.equal(visibleBench.fields.weight.placeholder, "0");
  assert.equal(visibleBench.fields.reps.placeholder, "0");
  assert.equal(visibleBench.fields.weight.value, "140");
  assert.equal(visibleBench.fields.reps.value, "6");
  assert.equal(visibleBench.fields.rir.value, "2");
  assert.equal(bench.rows[0].fields.weight.value, "140");
  assert.equal(visibleSquat.fields.reps.placeholder, "12");
});

test("personal-best weight is independent of selected date while reps remain historical", () => {
  const f = fixture();
  const log = f.carousel.logs[0];
  f.updateSetHistoryPlaceholders(log);
  assert.equal(f.carousel.visibleRows[0].fields.weight.placeholder, "225");
  log.dateInput.value = "2026-09-09";
  f.updateSetHistoryPlaceholders(log);
  assert.equal(f.carousel.visibleRows[0].fields.weight.placeholder, "225");
  assert.equal(f.carousel.visibleRows[0].fields.reps.placeholder, "0");
});

test("a record saved today replaces a previous record without changing typed values", () => {
  const f = fixture("superset");
  const bench = f.carousel.logs[0];
  const input = bench.rows[0].fields.weight;
  input.value = "150";
  f.history.push({ exercise_name: "Bench Press", exercise_code: "CW9", entry_date: "2026-09-18", set_number: 2, weight_used: 230.25, reps: 1 });
  f.updateSetHistoryPlaceholders(bench);
  assert.equal(input.value, "150");
  assert.equal(input.placeholder, "230.25");
  assert.equal(f.carousel.visibleRows[0].fields.weight.placeholder, "230.25");
  assert.match(f.carousel.visibleRows[0].fields.weight.attributes["aria-description"], /Personal best: 230.25 lb/);
  f.renderCustomWorkoutGroupedCard(f.carousel);
  assert.match(f.sections.innerHTML, /aria-description="Personal best: 230.25 lb/);
});

test("clearing an editable exercise name clears its old record hints", () => {
  const f = fixture();
  const bench = f.carousel.logs[0];
  bench.dataset.exerciseName = "Bench Press";
  f.updateSetHistoryPlaceholders(bench);
  bench.nameInput.value = "";
  f.updateSetHistoryPlaceholders(bench);
  assert.equal(bench.rows[0].fields.weight.placeholder, "0");
  assert.equal(f.carousel.visibleRows[0].fields.weight.placeholder, "0");
  assert.equal(f.carousel.visibleRows[0].fields.weight.attributes["aria-description"], undefined);
});

test("personal best excludes warm-ups, cardio and invalid weights; ties use first achievement", () => {
  const f = fixture();
  const base = { exercise_code: "A1", entry_date: "2026-09-19", set_number: 1, weight_used: 225, reps: 3 };
  const firstRecord = { ...base, entry_date: "2026-08-01" };
  const invalid = [
    { weight_used: 999, set_type: "warm_up" }, { weight_used: 999, set_number: 1001 },
    { weight_used: 999, exercise_code: "CARDIO" }, { weight_used: 999, exercise_code: "WU" },
    { weight_used: 999, entry_date: "" },
    ...[null, undefined, "", "  ", -10, Infinity, "bad"].map(weight_used => ({ weight_used }))
  ].map(values => ({ ...base, ...values }));
  assert.equal(f.personalBestWeightLog([base, ...invalid, firstRecord]), firstRecord);
  assert.equal(f.personalBestWeightLog(invalid), null);
});

test("warm-up fields use previous warm-up values and never the working-weight record", () => {
  const f = fixture();
  const bench = f.carousel.logs[0];
  const warmup = f.row(1001);
  warmup.dataset.setType = "warm_up";
  bench.rows.unshift(warmup);
  f.history.push({ exercise_name: "Bench Press", exercise_code: "A1", entry_date: "2026-09-10", set_number: 1001, set_type: "warm_up", weight_used: 45, reps: 10 });
  f.updateSetHistoryPlaceholders(bench);
  assert.equal(warmup.fields.weight.placeholder, "45");
  assert.equal(warmup.fields.reps.placeholder, "10");
  assert.equal(warmup.fields.weight.dataset.historyHint, "");
  assert.equal(bench.rows[1].fields.weight.placeholder, "225");
  assert.equal(bench.rows[1].fields.reps.placeholder, "8");
});

test("restoring a renamed exercise on another workout date refreshes the matching personal best", () => {
  const f = fixture();
  const slot = f.carousel.logs[0];
  Object.assign(slot.dataset, { exerciseName: "Bench Press", exerciseCode: "A1", workoutTitle: "Workout A" });
  f.history.push({ workout_title: "Workout A", exercise_name: "Squat", exercise_code: "A1", entry_date: "2026-09-18", set_number: 1, weight_used: 180, reps: 6 });
  f.updateSetHistoryPlaceholders(slot);
  assert.equal(slot.rows[0].fields.weight.placeholder, "225");
  f.updateExerciseLogField(slot);
  assert.equal(slot.nameInput.value, "Squat");
  assert.equal(slot.rows[0].fields.weight.value, 180);
  assert.equal(slot.rows[0].fields.weight.placeholder, "180");
  assert.equal(f.carousel.visibleRows[0].fields.weight.placeholder, "180");
});
