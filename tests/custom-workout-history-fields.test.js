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
  const input = () => ({ value: "", placeholder: "", dataset: { defaultPlaceholder: "0" } });
  const row = (number = 1) => ({
    dataset: { setNumber: String(number), setType: "working" },
    fields: { weight: input(), reps: input() },
    classList: { contains: () => false },
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
    "normalizedSetType", "setTypeForRow", "customWorkoutGroupedRows", "customWorkoutGroupedCanonicalRow",
    "customWorkoutCarouselCards", "customWorkoutGroupedLogElements",
    "latestPreviousSetLogs", "heaviestPreviousSetLog", "historyPlaceholder", "updateSetHistoryPlaceholders",
    "syncCustomWorkoutGroupedHistoryPlaceholders", "setRowInputValues",
    "customWorkoutGroupedFieldMarkup", "customWorkoutGroupedSetRowMarkup", "renderCustomWorkoutGroupedCard"
  ];
  const dependencies = {
    trainingLogs: history, warmupExerciseCode: "WU", cardioExerciseCode: "CARDIO",
    warmUpSetType: "warm_up", workingSetType: "working", warmUpSetNumberBase: 1000,
    todayDate: () => "2026-09-18", exerciseNameInputForLog: (log) => log.nameInput,
    escapeHtml: (value) => String(value ?? "").replaceAll('"', "&quot;"),
    normalizeCustomWorkoutGroupedRoundRows: () => false,
    renderCustomWorkoutGroupedExerciseKey: () => {}, syncCustomWorkoutGroupedRoundStepper: () => {},
    refreshCustomWorkoutGroupedCompletion: () => {}, renderCustomWorkoutGroupedTimerPanels: () => {},
    renderCustomWorkoutGroupedRestControls: () => {}
  };
  const api = Function(...Object.keys(dependencies), `
    ${functions.map(sourceForFunction).join("\n")}
    function customWorkoutGroupedSectionsMarkup(carousel) {
      return carousel.logs.map((log, index) => log.rows.map((row) =>
        customWorkoutGroupedSetRowMarkup(row, 'A1', index, 'working', 1, log.nameInput.value)
      ).join('')).join('');
    }
    return { updateSetHistoryPlaceholders, renderCustomWorkoutGroupedCard };
  `)(...Object.values(dependencies));
  return { ...api, carousel, sections, row, visibleRow };
}

for (const assigned of [false, true]) {
 for (const format of ["single", "superset", "circuit"]) {
  test(`${assigned ? "assigned" : "custom"} ${format}: initial render and added sets show previous weight and reps as hints`, () => {
    const f = fixture(format, assigned);
    f.renderCustomWorkoutGroupedCard(f.carousel);
    assert.match(f.sections.innerHTML, /value=""\s+placeholder="135"\s+data-custom-grouped-field="weight"/);
    assert.match(f.sections.innerHTML, /value=""\s+placeholder="8"\s+data-custom-grouped-field="reps"/);
    assert.match(f.sections.innerHTML, /placeholder="0"\s+data-custom-grouped-field="weight"/);
    f.carousel.logs[0].rows.push(f.row(2));
    f.renderCustomWorkoutGroupedCard(f.carousel);
    assert.equal((f.sections.innerHTML.match(/placeholder="135"/g) || []).length, 2);
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
  assert.equal(visibleBench.fields.weight.placeholder, "135");
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

test("changing the selected date clears hints from later sessions", () => {
  const f = fixture();
  const log = f.carousel.logs[0];
  f.updateSetHistoryPlaceholders(log);
  assert.equal(f.carousel.visibleRows[0].fields.weight.placeholder, "135");
  log.dateInput.value = "2026-09-09";
  f.updateSetHistoryPlaceholders(log);
  assert.equal(f.carousel.visibleRows[0].fields.weight.placeholder, "0");
  assert.equal(f.carousel.visibleRows[0].fields.reps.placeholder, "0");
});
