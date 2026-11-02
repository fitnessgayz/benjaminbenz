const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
function extract(name) {
  const match = new RegExp(`(?:async\\s+)?function ${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const tail = source.slice(match.index + match[0].length);
  const next = tail.search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/);
  return source.slice(match.index, next < 0 ? undefined : match.index + match[0].length + next);
}
function context(names, values = {}) {
  const sandbox = vm.createContext(values);
  vm.runInContext(names.map(extract).join("\n"), sandbox);
  return sandbox;
}

test("new superset and circuit workouts start without exercise cards", () => {
  const ctx = context(["customWorkoutDefaultExerciseCount", "customWorkoutCarouselMarkup"], {
    customWorkoutTitle: "Custom Workout", normalizeCustomWorkoutFormat: (value) => value,
    customWorkoutExercises: () => [], customWorkoutMixedGroups: () => [],
    customWorkoutCarouselGroupMarkup: () => { throw new Error("Empty group rendered"); }
  });
  for (const format of ["superset", "circuit"]) {
    assert.equal(ctx.customWorkoutDefaultExerciseCount(format), 0);
    assert.doesNotMatch(ctx.customWorkoutCarouselMarkup(format), /data-custom-workout-grouped/);
  }
});

test("timed sets serialize seconds without reps", () => {
  const rows = [true, false].map((timed) => ({ dataset: { setNumber: "1", timedSet: String(timed) } }));
  const log = {
    dataset: { workoutTitle: "Custom Workout", exerciseCode: "CW01", exerciseName: "Plank" },
    querySelector: (selector) => selector === "[data-log-date]" ? { value: "2026-11-02" } : null,
    querySelectorAll: () => rows, closest: () => null
  };
  const ctx = context(["rowsForTrainingLog"], {
    todayDate: () => "2026-11-02", workoutGymLocationForElement: () => "",
    exerciseNameInputForLog: () => null, activeClientEmail: "tester@example.com",
    setRowInputValues: () => ({ weightRaw: "0", weightValue: 0, repsRaw: "30", repsValue: 30 }),
    setTypeForRow: () => "working", isSetRowLogged: () => true,
    warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO"
  });
  const saved = ctx.rowsForTrainingLog(log);
  assert.deepEqual([saved[0].set_type, saved[0].duration_seconds, saved[0].reps], ["timed", 30, null]);
  assert.deepEqual([saved[1].set_type, saved[1].duration_seconds, saved[1].reps], ["working", null, 30]);
});

test("rest control stays attached to the same exercise and round after redraw", () => {
  const newAction = {};
  const carousel = {
    dataset: {}, querySelector: (selector) => selector === "[data-custom-grouped-sections]" ? sections : null,
    closest: () => null
  };
  const sections = {
    innerHTML: "", contains: () => false,
    querySelector: (selector) => selector.includes('data-ios-log-exercise-index="1"') &&
      selector.includes('data-custom-grouped-round="2"') ? newAction : null
  };
  const block = { dataset: { iosLogExerciseIndex: "1" } };
  const oldSection = { dataset: { kind: "round", customGroupedRound: "2" },
    closest: (selector) => selector === "[data-ios-log-exercise-index]" ? block : carousel };
  const oldAction = { closest: () => oldSection };
  const ctx = context(["renderCustomWorkoutGroupedCard"], {
    customWorkoutGroupedRestAction: oldAction, customWorkoutGroupedLogElements: () => [],
    normalizeCustomWorkoutGroupedRoundRows: () => false,
    renderCustomWorkoutGroupedExerciseKey() {}, customWorkoutGroupedSectionsMarkup: () => "<section></section>",
    renderCustomWorkoutGroupedNotes() {}, syncCustomWorkoutGroupedRoundStepper() {},
    refreshCustomWorkoutGroupedCompletion() {}, renderCustomWorkoutGroupedTimerPanels() {},
    renderCustomWorkoutGroupedRestControls() {}, document: { activeElement: null }, window: { scrollY: 0 }
  });
  ctx.renderCustomWorkoutGroupedCard(carousel);
  assert.equal(ctx.customWorkoutGroupedRestAction, newAction);
});

test("an intentionally omitted exercise set does not block round completion", () => {
  const completeRow = { classList: { contains: () => true } };
  const logs = [{ id: "first" }, { id: "second" }];
  const ctx = context(["customWorkoutGroupedRoundIsLogged"], {
    customWorkoutGroupedLogElements: () => logs,
    customWorkoutGroupedRows: (log) => log.id === "first" ? [completeRow] : [],
    workingSetType: "working"
  });
  assert.equal(ctx.customWorkoutGroupedRoundIsLogged({}, 1), true);
});

test("straight, superset and circuit rest waits for the final exercise in the round", async () => {
  for (const [format, count] of [["single", 1], ["superset", 2], ["circuit", 3]]) {
    for (let index = 0; index < count; index++) {
      const timerCalls = [];
      const log = { dataset: { exerciseRest: "60s" }, querySelector: () => ({ textContent: "" }) };
      const cards = Array.from({ length: count }, () => ({}));
      const carousel = { dataset: { customWorkoutFormat: format, customWorkoutGroup: "0" }, closest: () => ({ dataset: {} }) };
      let progressCalls = 0;
      const ctx = context(["logCurrentWorkoutCarouselSet"], {
        activeCustomWorkoutFormat: format, normalizeCustomWorkoutFormat: (value) => value,
        customWorkoutCarouselCards: () => cards,
        workoutCarouselProgress: () => (++progressCalls === 1
          ? { current: { index, round: 1, exercise: { logElement: log, completed: 0 } } }
          : { isComplete: index === count - 1, current: { index: (index + 1) % count, round: index === count - 1 ? 2 : 1 } }),
        filledSetCount: () => 1, setWorkoutCarouselAutosaveState() {},
        saveTrainingLogRows: async () => ({ saved: true }),
        workoutGroupReadyForRest: (_format, size) => size >= count, autoRestTimerEnabled: () => true,
        workoutCarouselRestSeconds: () => 60,
        setRestTimerDuration: () => timerCalls.push("duration"),
        openRestTimer: () => timerCalls.push("open"),
        startOrPauseRestTimer: () => timerCalls.push("start"),
        moveCustomWorkoutCarousel() {}, renderCustomWorkoutCarousel() {}
      });
      await ctx.logCurrentWorkoutCarouselSet({ closest: () => carousel });
      assert.deepEqual(timerCalls, index === count - 1 ? ["duration", "open", "start"] : [],
        `${format} exercise ${index + 1} of ${count}`);
    }
  }
});

test("A1 options can turn only the selected set into seconds", () => {
  const handlers = {};
  const dialog = { dataset: {}, addEventListener: (name, callback) => { handlers[name] = callback; },
    showModal() {}, close() { handlers.close(); }, remove() {} };
  const reps = { value: "8" };
  const log = { dataset: {} };
  const row = { dataset: { setType: "working", setNumber: "1" },
    classList: { contains: () => false }, querySelector: () => reps, closest: () => log };
  const other = { dataset: { setType: "working", setNumber: "1" } };
  const visible = { dataset: { customGroupedExerciseIndex: "0", customGroupedSetType: "working", customGroupedSetNumber: "1" } };
  const carousel = { dataset: {} };
  const button = { textContent: "A1", closest: (selector) => selector === ".custom-workout-grouped-row" ? visible : carousel,
    isConnected: true, focus() {} };
  let rendered = 0;
  const ctx = context(["openCustomWorkoutGroupedSetOptions"], {
    document: { querySelector: () => null, createElement: () => dialog, body: { append() {} } },
    customWorkoutGroupedCanonicalRow: () => row, customWorkoutGroupedRows: () => [row, other],
    setTypeForRow: () => "working", warmUpSetType: "warm_up", workingSetType: "working",
    escapeHtml: String, setCustomWorkoutGroupedRowComplete() {},
    persistCustomWorkoutDraftForElement() {}, renderCustomWorkoutGroupedCard: () => { rendered++; },
    scheduleTrainingLogAutosave() {}
  });
  ctx.openCustomWorkoutGroupedSetOptions(button);
  assert.match(dialog.innerHTML, /Make this a timed set \(seconds\)/);
  handlers.click({ target: { closest: (selector) => selector === "[data-set-option]"
    ? { dataset: { setOption: "timed" } } : null } });
  assert.equal(row.dataset.timedSet, "true");
  assert.equal(reps.value, "");
  assert.equal(other.dataset.timedSet, undefined);
  assert.equal(rendered, 1);
});
