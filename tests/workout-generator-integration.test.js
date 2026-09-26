const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const workoutLayout = require("../js/workout-layout.js");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function declaration(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const rest = source.slice(match.index + match[0].length);
  const end = rest.search(/\n(?:async\s+)?function\s+[\w$]+\s*\(/);
  return source.slice(match.index, end < 0 ? undefined : match.index + match[0].length + end);
}

function evaluate(names, values = {}) {
  const context = vm.createContext({
    customWorkoutTitle: "Custom workout",
    customWorkoutDraftVersion: 2,
    warmUpSetType: "warm_up",
    workingSetType: "working",
    todayDate: () => "2026-09-25",
    ...values
  });
  vm.runInContext(names.map(declaration).join("\n"), context);
  return context;
}

function workout() {
  return {
    title: "Leg day", focus: "legs", minutes: 30, intensity: "moderate", estimatedMinutes: 29,
    exercises: [
      { name: "Goblet squat", sets: 3, prescription: "3 × 8–12", rest: "75 seconds" },
      { name: "Romanian deadlift", sets: 2, prescription: "2 × 10–12", rest: "60 seconds" }
    ]
  };
}

test("generated sessions receive distinct identities, prescribed set counts, and blank performance entries", () => {
  let random = 0;
  const context = evaluate(["customExerciseCode", "generatedCustomWorkoutDraft"], {
    Math: Object.assign(Object.create(Math), { random: () => ++random / 10 })
  });
  const input = workout();
  const before = plain(input);
  const createdAt = new Date("2026-09-25T16:30:00.000Z");
  const first = plain(context.generatedCustomWorkoutDraft(input, createdAt));
  const second = plain(context.generatedCustomWorkoutDraft(input, createdAt));

  assert.notEqual(first.workoutTitle, second.workoutTitle, "Two sessions created in the same millisecond must not share log identity");
  assert.notEqual(first.generatedFrom.id, second.generatedFrom.id);
  assert.equal(first.version, 2);
  assert.equal(first.date, "2026-09-25");
  assert.equal(first.format, "single");
  assert.equal(first.nextExerciseNumber, 3);
  assert.deepEqual(first.generatedFrom, {
    id: first.generatedFrom.id, title: "Leg day", focus: "legs", minutes: 30,
    intensity: "moderate", estimatedMinutes: 29
  });
  assert.match(first.workoutTitle, /^Custom workout · Leg day · /);
  assert.deepEqual(first.exercises.map(({ code, group, groupType, generated }) => ({ code, group, groupType, generated })), [
    { code: "CW01", group: 0, groupType: "single", generated: true },
    { code: "CW02", group: 1, groupType: "single", generated: true }
  ]);
  first.exercises.forEach((exercise, index) => {
    assert.equal(exercise.prescription, input.exercises[index].prescription);
    assert.equal(exercise.rest, input.exercises[index].rest);
    assert.equal(exercise.name, input.exercises[index].name);
    assert.equal(exercise.date, first.date);
    assert.equal(exercise.notes, "");
    assert.equal(exercise.skipped, false);
    assert.equal(exercise.sets.length, input.exercises[index].sets + 1);
    assert.deepEqual(exercise.sets.map((set) => [set.label, set.setType]), [
      ["W", "warm_up"], ...Array.from({ length: input.exercises[index].sets }, (_, i) => [String(i + 1), "working"])
    ]);
    exercise.sets.forEach((set) => assert.deepEqual(
      [set.weight, set.reps, set.rir, set.complete], ["", "", "", false]
    ));
  });
  assert.deepEqual(input, before, "Preparing a local draft must not change the generated preview");
  assert.throws(() => context.generatedCustomWorkoutDraft({ exercises: [] }), /Generate a workout/);
});

test("recovery draft handoff keeps timed targets and creates only the prescribed blank working sets", () => {
  const context = evaluate(["customExerciseCode", "generatedCustomWorkoutDraft"]);
  for (const focus of ["recovery_upper", "recovery_lower", "recovery_full"]) {
    const preview = { ...workout(), focus, intensity: "easy", exercises: [{ name: "Cross-Body Shoulder Stretch", sets: 2, prescription: "20-30 sec/side x 2 sets", rest: "20 sec" }] };
    const draft = plain(context.generatedCustomWorkoutDraft(preview));
    assert.equal(draft.generatedFrom.focus, focus);
    assert.equal(draft.exercises[0].omitWarmup, true);
    assert.equal(draft.exercises[0].prescription, preview.exercises[0].prescription);
    assert.equal(draft.exercises[0].rest, "20 sec");
    assert.equal(draft.exercises[0].sets.length, 2);
    assert.deepEqual(draft.exercises[0].sets.map((set) => [set.label, set.setType, set.weight, set.reps, set.rir, set.complete]), [
      ["1", "working", "", "", "", false], ["2", "working", "", "", "", false]
    ]);
  }
  const strength = plain(context.generatedCustomWorkoutDraft(workout()));
  assert.equal(strength.exercises[0].sets[0].setType, "warm_up");
  assert.equal(Object.hasOwn(strength.exercises[0], "omitWarmup"), false);
});

test("restoring, grouping, and serializing recovery exercises never inserts an extra warm-up or recorded reps", () => {
  const target = { textContent: "" };
  const card = { dataset: { customWorkoutGroup: "0", customWorkoutGroupType: "single" }, querySelector: () => target };
  const name = { value: "Cross-Body Shoulder Stretch" };
  const fields = { "[data-log-date]": { value: "" }, "[data-log-notes]": { value: "" } };
  let rows = [];
  const container = {
    querySelectorAll: () => [...rows],
    appendChild(row) { rows = rows.filter((item) => item !== row); rows.push(row); }
  };
  function addRow(index, warmup = false) {
    const attributes = new Map();
    const classes = new Set();
    const input = (value = "") => ({ value, setAttribute() {} });
    const inputs = {
      "[data-set-label]": input(warmup ? "W" : String(index)),
      "[data-set-weight]": input(), "[data-set-reps]": input(),
      "[data-complete-set]": { getAttribute: (key) => attributes.get(key), setAttribute: (key, value) => attributes.set(key, value) }
    };
    const row = {
      dataset: { setNumber: String(index), setType: warmup ? "warm_up" : "working" },
      classList: { contains: (key) => classes.has(key), toggle(key, value) { if (value) classes.add(key); else classes.delete(key); } },
      querySelector: (selector) => inputs[selector] || null,
      remove() { rows = rows.filter((item) => item !== row); }
    };
    rows.push(row);
    return row;
  }
  addRow(1001, true);
  for (let index = 1; index <= 3; index++) addRow(index);
  const log = {
    dataset: { exerciseCode: "CW01", exerciseName: name.value, generatedExercise: "true", exercisePrescription: "20-30 sec/side x 2 sets", exerciseRest: "20 sec", setTargetMode: "visible" },
    querySelector: (selector) => selector === "[data-set-rows]" ? container : fields[selector] || null,
    querySelectorAll: () => [...rows], closest: () => card
  };
  const context = evaluate([
    "customExerciseCode", "generatedCustomWorkoutDraft", "applyCustomExerciseDraft", "applyCustomSetDraft", "serializeSetRowDraft", "serializeCustomExerciseDraft",
    "normalizedSetType", "warmUpOrdinal", "setNumberLabel", "setTypeForRow", "updateSetTypeFromLabel", "renumberSetRows", "syncVisibleSetTarget"
  ], {
    warmUpSetNumberBase: 1000, WorkoutLayout: workoutLayout,
    exerciseNameInputForLog: () => name, normalizeCustomWorkoutInlineGroupType: (value) => value || "single",
    ensureSetRows(_log, count) { while (rows.length < count) addRow(rows.length + 1); },
    renderSetRirValue() {}, renderExerciseNotesState() {}, syncExerciseNamePreview() {}, setExerciseSkipped() {}, updateVisibleSetProgress() {}, renderPreviousExerciseWeights() {}
  });
  const preview = { ...workout(), focus: "recovery_upper", exercises: [{ name: name.value, sets: 2, prescription: log.dataset.exercisePrescription, rest: "20 sec" }] };
  const original = plain(context.generatedCustomWorkoutDraft(preview)).exercises[0];
  context.applyCustomExerciseDraft(log, original);
  assert.equal(rows.length, 2);
  assert.equal(log.dataset.omitWarmup, "true");
  assert.equal(log.dataset.prescribedSets, "2");
  assert.equal(workoutLayout.prescription(log.dataset.exercisePrescription).reps, "20-30 sec/side");
  card.dataset.customWorkoutGroupType = "superset";
  card.dataset.customWorkoutGroup = "2";
  const saved = plain(context.serializeCustomExerciseDraft(log, 0));
  assert.equal(saved.omitWarmup, true);
  assert.equal(saved.groupType, "superset");
  assert.equal(saved.group, 2);
  context.applyCustomExerciseDraft(log, JSON.parse(JSON.stringify(saved)));
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.dataset.setType === "working" && !row.querySelector("[data-set-reps]").value && !row.querySelector("[data-set-weight]").value));
  assert.equal(plain(context.serializeCustomExerciseDraft(log, 0)).omitWarmup, true);
  // Clients can still add their own warm-up. Restore must preserve it rather than delete it.
  const manual = { ...saved, sets: [{ label: "W", setType: "warm_up", weight: "", reps: "" }, ...saved.sets] };
  context.applyCustomExerciseDraft(log, manual);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].dataset.setType, "warm_up");
  // An ordinary custom draft continues to receive its usual warm-up row.
  context.applyCustomExerciseDraft(log, { ...saved, omitWarmup: undefined });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].dataset.setType, "warm_up");
  assert.equal(Object.hasOwn(log.dataset, "omitWarmup"), false);
});

function useFixture(options = {}) {
  const previous = options.previous === undefined ? { format: "superset", workoutTitle: "Existing draft", exercises: [] } : options.previous;
  const state = { draft: previous, calls: [], logs: [{ workout_title: "Saved workout", reps: 12 }], persistedFormat: "superset" };
  const panel = { dataset: { customWorkoutFormat: "superset" } };
  state.panel = panel;
  const replacement = {
    replaceWith(value) { state.calls.push(["restore-panel"]); state.panel = value; },
    scrollIntoView(value) { state.calls.push(["scroll", plain(value)]); },
    querySelector(selector) {
      assert.equal(selector, "#custom-workout-panel-title");
      return { focus(value) { state.calls.push(["focus", plain(value)]); } };
    }
  };
  const context = evaluate(["customExerciseCode", "generatedCustomWorkoutDraft", "useGeneratedClientWorkout"], {
    activeCustomWorkoutFormat: "superset",
    workoutElapsedTimerState: options.timer || null,
    trainingLogs: state.logs,
    document: { querySelector: () => options.panelMissing ? null : state.panel },
    window: {
      confirm() { state.calls.push(["confirm"]); return options.confirm !== false; },
      requestAnimationFrame(callback) { state.calls.push(["frame"]); callback(); }
    },
    activeCustomWorkoutDraft: () => state.draft,
    customWorkoutPanelHasEnteredExerciseContent: () => Boolean(options.entered),
    customWorkoutPanelHasAuxiliaryContent: () => Boolean(options.auxiliary),
    clientCustomWorkoutPanelIndex: () => 4,
    cancelTrainingLogAutosaves(value) { assert.equal(value, panel); state.calls.push(["cancel-autosaves"]); },
    storeCustomWorkoutDraft(draft) {
      state.calls.push(["store-draft", draft]);
      if (!options.storageFailure) state.draft = draft;
    },
    clearCustomWorkoutDraft() { state.calls.push(["clear-draft"]); state.draft = null; },
    replaceCustomWorkoutPanelFromDraft(index) {
      state.calls.push(["replace", index]);
      if (options.replacementThrows) throw new Error("Unable to render workout");
      if (!options.replacementMissing) state.panel = replacement;
      if (options.throwAfterReplacement) throw new Error("Unable to render workout");
      return options.replacementMissing ? null : replacement;
    },
    storeCustomWorkoutFormat(format) { state.calls.push(["store-format", format]); state.persistedFormat = format; },
    closeCustomExerciseSuggestions: () => state.calls.push(["close-suggestions"]),
    closeRirDialog: () => state.calls.push(["close-rir"]),
    closeRestTimer: () => state.calls.push(["close-rest"]),
    resetRestTimer: () => state.calls.push(["reset-rest"]),
    setClientDashboardTab: (tab) => state.calls.push(["tab", tab]),
    activateClientWorkoutPanel: (index, opts) => state.calls.push(["activate", index, plain(opts)]),
    startWorkoutElapsedTimer: () => { throw new Error("Using a preview must not start a workout"); },
    saveTrainingLog: () => { throw new Error("Using a preview must not save completed exercise logs"); },
    saveTrainingLogs: () => { throw new Error("Using a preview must not save completed exercise logs"); }
  });
  return { context, state, previous, panel };
}

test("an active workout blocks replacement before touching the draft, timers, or logs", () => {
  const fixture = useFixture({ timer: { workoutTitle: "Assigned workout", startedAt: 123 } });
  const originalTimer = fixture.context.workoutElapsedTimerState;
  assert.throws(() => fixture.context.useGeneratedClientWorkout(workout()), /Finish or cancel your current workout/);
  assert.equal(fixture.state.draft, fixture.previous);
  assert.equal(fixture.context.workoutElapsedTimerState, originalTimer);
  assert.equal(fixture.context.activeCustomWorkoutFormat, "superset");
  assert.deepEqual(fixture.state.calls, []);
});

for (const [label, options] of [
  ["entered exercises", { entered: true }],
  ["warm-up or cardio entries", { auxiliary: true }],
  ["an earlier generated preview", { previous: { generatedFrom: { id: "prior-generated" } } }],
  ["a copied workout", { previous: { copiedFrom: { workoutTitle: "Yesterday" } } }]
]) {
  test(`declining replacement preserves ${label}`, () => {
    const fixture = useFixture({ ...options, confirm: false });
    assert.equal(fixture.context.useGeneratedClientWorkout(workout()), false);
    assert.equal(fixture.state.draft, fixture.previous);
    assert.equal(fixture.context.activeCustomWorkoutFormat, "superset");
    assert.deepEqual(fixture.state.calls, [["confirm"]]);
  });
}

test("failed storage verification leaves the existing panel and format in place", () => {
  const fixture = useFixture({ storageFailure: true });
  assert.throws(() => fixture.context.useGeneratedClientWorkout(workout()), /could not save the workout draft/);
  assert.equal(fixture.state.draft, fixture.previous);
  assert.equal(fixture.context.activeCustomWorkoutFormat, "superset");
  assert.deepEqual(fixture.state.calls.map(([name]) => name), ["cancel-autosaves", "store-draft"]);
});

for (const options of [{ replacementMissing: true }, { replacementThrows: true }, { throwAfterReplacement: true }]) {
  for (const previous of [null, { format: "circuit", workoutTitle: "Existing", exercises: [{ name: "Keep me" }] }]) {
    test(`failed panel replacement restores ${previous ? "the prior draft" : "an empty draft store"} (${Object.keys(options)[0]})`, () => {
      const fixture = useFixture({ ...options, previous });
      assert.throws(() => fixture.context.useGeneratedClientWorkout(workout()), /could not be opened|Unable to render/);
      assert.equal(fixture.state.draft, previous);
      assert.equal(fixture.context.activeCustomWorkoutFormat, "superset");
      assert.equal(fixture.state.persistedFormat, "superset");
      assert.equal(fixture.state.panel, fixture.panel, "Failure after DOM replacement must restore the original form");
      assert.deepEqual(fixture.state.calls.map(([name]) => name), [
        "cancel-autosaves", "store-draft", "replace", ...(options.throwAfterReplacement ? ["restore-panel"] : []),
        "store-format", previous ? "store-draft" : "clear-draft"
      ]);
    });
  }
}

test("using a generated preview opens a ready draft without starting a timer or changing saved history", () => {
  const fixture = useFixture();
  const beforeLogs = plain(fixture.state.logs);
  assert.equal(fixture.context.useGeneratedClientWorkout(workout()), true);
  assert.equal(fixture.context.activeCustomWorkoutFormat, "single");
  assert.equal(fixture.context.workoutElapsedTimerState, null);
  assert.equal(fixture.state.draft.exercises.length, 2);
  assert.deepEqual(fixture.state.logs, beforeLogs);
  assert.deepEqual(fixture.state.calls.map(([name]) => name), [
    "cancel-autosaves", "store-draft", "replace", "store-format", "close-suggestions", "close-rir",
    "close-rest", "reset-rest", "tab", "activate", "frame", "scroll", "focus"
  ]);
  assert.deepEqual(fixture.state.calls.find(([name]) => name === "activate"), ["activate", 4, { scroll: false, focus: false }]);
  assert.deepEqual(fixture.state.calls.find(([name]) => name === "tab"), ["tab", "workouts"]);
});

function exerciseLogFixture({ generated = true, name = "Goblet squat", code = "CW01" } = {}) {
  const fields = { "[data-log-date]": { value: "2026-09-25" }, "[data-log-notes]": { value: "Use comfortable range" } };
  const rowFields = {
    "[data-set-label]": { value: "1" }, "[data-set-weight]": { value: "" }, "[data-set-reps]": { value: "" },
    "[data-complete-set]": { getAttribute: () => "false" }
  };
  const row = { dataset: { repsInReserve: "" }, classList: { contains: () => false }, querySelector: (selector) => rowFields[selector] };
  return {
    nameInput: { value: name },
    dataset: {
      exerciseCode: code, exerciseName: name, ...(generated ? { generatedExercise: "true" } : {}),
      exercisePrescription: "3 × 8–12", exerciseRest: "75 seconds"
    },
    closest: () => ({ dataset: { customWorkoutGroup: "0", customWorkoutGroupType: "single" } }),
    querySelector: (selector) => fields[selector] || null,
    querySelectorAll: () => [row]
  };
}

test("generated targets and provenance survive serialization and restoration while ordinary custom entries remain generic", () => {
  const current = { workoutTitle: "Custom workout · Leg day · unique", generatedFrom: { id: "unique", title: "Leg day" } };
  const logs = [exerciseLogFixture(), exerciseLogFixture({ generated: false, name: "Cable curl", code: "CW02" })];
  logs[0].dataset.omitWarmup = "true";
  const panel = {
    dataset: { customWorkoutFormat: "single", customWorkoutTitle: current.workoutTitle, customWorkoutNextExerciseNumber: "3" },
    querySelectorAll: () => logs,
    querySelector: (selector) => selector === "[data-workout-date]" ? { value: "2026-09-25" } : {}
  };
  let stored = current;
  const context = evaluate([
    "customExerciseCode", "serializeSetRowDraft", "serializeCustomExerciseDraft", "customWorkoutPanelDraft",
    "customWorkoutDraftExercises", "customWorkoutExercises"
  ], {
    activeCustomWorkoutFormat: "single", activeCustomWorkoutDraft: () => stored,
    normalizeCustomWorkoutFormat: (value) => value,
    normalizeCustomWorkoutInlineGroupType: (value) => value || "single",
    exerciseNameInputForLog: (log) => log.nameInput,
    setTypeForRow: () => "working"
  });
  stored = plain(context.customWorkoutPanelDraft(panel));
  assert.deepEqual(stored.generatedFrom, current.generatedFrom);
  assert.equal(stored.workoutTitle, current.workoutTitle);
  assert.equal(stored.exercises[0].generated, true);
  assert.equal(stored.exercises[0].prescription, "3 × 8–12");
  assert.equal(stored.exercises[0].rest, "75 seconds");
  assert.equal(stored.exercises[0].sets[0].complete, false);
  assert.equal(stored.exercises[0].omitWarmup, true);
  assert.equal(Object.hasOwn(stored.exercises[1], "omitWarmup"), false);
  assert.equal(Object.hasOwn(stored.exercises[1], "generated"), false);
  assert.equal(Object.hasOwn(stored.exercises[1], "prescription"), false);
  const restored = plain(context.customWorkoutExercises());
  assert.equal(restored[0].omitWarmup, true);
  assert.equal(Object.hasOwn(restored[1], "omitWarmup"), false);
  assert.deepEqual(restored.map(({ generated, prescription, rest }) => ({ generated: Boolean(generated), prescription, rest })), [
    { generated: true, prescription: "3 × 8–12", rest: "75 seconds" },
    { generated: false, prescription: "Custom sets", rest: "" }
  ]);
});

test("launcher supplies only the selected client's history and rejects previews after a client or program switch", () => {
  let dialogOptions;
  const uses = [];
  const history = [
    { client_email: " Athlete@Example.com ", exercise_name: "Squat" },
    { client_email: "other@example.com", exercise_name: "Private exercise" },
    { client_email: "athlete@example.com", exercise_name: "Row" },
    { exercise_name: "Unattributed exercise" }
  ];
  const library = [{ name: "Squat" }];
  const context = evaluate(["openClientWorkoutGenerator"], {
    activeClientEmail: "athlete@example.com", currentProgram: { id: "program-a" },
    exerciseLibraryEntries: library, trainingLogs: history,
    normalizeClientEmail: (value) => String(value || "").trim().toLowerCase(),
    useGeneratedClientWorkout: (value) => { uses.push(value); return true; },
    window: { FWB_WORKOUT_GENERATOR: {}, FWB_WORKOUT_GENERATOR_DIALOG: { open(options) { dialogOptions = options; } } }
  });
  const button = {};
  context.openClientWorkoutGenerator(button);
  assert.equal(dialogOptions.returnFocus, button);
  assert.equal(dialogOptions.library, library);
  assert.deepEqual(plain(dialogOptions.history), [history[0], history[2]]);
  const preview = workout();
  assert.equal(dialogOptions.onUse(preview), true);
  assert.deepEqual(uses, [preview]);
  context.activeClientEmail = "other@example.com";
  assert.throws(() => dialogOptions.onUse(preview), /selected program changed/);
  context.activeClientEmail = "athlete@example.com";
  context.currentProgram = { id: "program-b" };
  assert.throws(() => dialogOptions.onUse(preview), /selected program changed/);
  assert.deepEqual(uses, [preview], "Stale previews must not reach draft replacement");
});

test("missing generator assets produce a recoverable message", () => {
  const alerts = [];
  const context = evaluate(["openClientWorkoutGenerator"], { window: { alert: (message) => alerts.push(message) } });
  context.openClientWorkoutGenerator({});
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /Refresh the page/);
});

test("generated rest buttons use the prescribed duration while ordinary workout buttons retain the chosen timer", () => {
  for (const [dataset, expectedSeconds] of [
    [{ generatedExercise: "true", exerciseRest: "75 seconds" }, 75],
    [{ generatedExercise: "true", exerciseRest: "1.5 minutes" }, 90],
    [{ generatedExercise: "true", exerciseRest: "" }, null],
    [{ exerciseRest: "75 seconds" }, null]
  ]) {
    const durations = [];
    const classes = [];
    let focused = false;
    const overlay = { hidden: true, querySelector: () => ({ focus() { focused = true; } }) };
    const button = { closest: () => ({ dataset }) };
    const context = evaluate(["workoutCarouselRestSeconds", "openRestTimer"], {
      ensureRestTimer: () => overlay,
      setRestTimerDuration: (seconds) => durations.push(seconds),
      renderRestTimer: () => {},
      document: { body: { classList: { add: (value) => classes.push(value) } } },
      customWorkoutGroupedRestAction: {}, restTimerReturnFocus: null
    });
    context.openRestTimer(button);
    assert.deepEqual(durations, expectedSeconds === null ? [] : [expectedSeconds]);
    assert.equal(overlay.hidden, false);
    assert.equal(focused, true);
    assert.equal(context.restTimerReturnFocus, button);
    assert.equal(context.customWorkoutGroupedRestAction, null);
    assert.deepEqual(classes, ["rest-timer-open"]);
  }
});

test("logging a generated set uses its prescribed rest and mixed groups use the longest generated rest", async () => {
  for (const [specs, expectedRest, saved] of [
    [[{ generatedExercise: "true", exerciseRest: "75 seconds" }], 75, true],
    [[{ generatedExercise: "true", exerciseRest: "75 seconds" }, { generatedExercise: "true", exerciseRest: "1.5 minutes" }, { exerciseRest: "180 seconds" }], 90, true],
    [[{ exerciseRest: "180 seconds" }], null, true],
    [[{ generatedExercise: "true", exerciseRest: "75 seconds" }], null, false]
  ]) {
    const calls = [];
    const logs = specs.map((dataset) => {
      const completed = new Set();
      const row = { dataset: {}, classList: {
        contains: (value) => completed.has(value),
        toggle(value, enabled) { if (enabled) completed.add(value); else completed.delete(value); }
      }, querySelector: () => null };
      return { dataset, rows: [row], querySelectorAll: () => [row] };
    });
    const restAction = {};
    const carousel = {
      dataset: {},
      querySelector: (selector) => selector.includes("round-action") ? restAction : null
    };
    const section = { dataset: { customGroupedRound: "1" } };
    const button = {
      dataset: { customGroupedLogRound: "1" },
      closest: (selector) => selector.includes("data-custom-workout-grouped") ? carousel : section
    };
    const context = evaluate(["setCustomWorkoutGroupedRowComplete", "workoutCarouselRestSeconds", "logCustomWorkoutGroupedRound"], {
      customWorkoutGroupedStatus: () => ({}),
      customWorkoutGroupedLogElements: () => logs,
      customWorkoutGroupedRows: (log) => log.rows,
      customWorkoutGroupedTimerConflict: () => false,
      validateCustomWorkoutGroupedExerciseNames: () => true,
      validateCustomWorkoutGroupedSection: () => ({ valid: true }),
      completeEnteredCustomWorkoutWarmUps: () => ({ valid: true, rows: [], previousStates: [] }),
      clearCustomWorkoutGroupedWeightCopy: () => {},
      persistCustomWorkoutDraftForElement: () => {},
      refreshCustomWorkoutGroupedCompletion: () => {},
      workoutSetUnit: () => "Set",
      saveTrainingLogRows: async () => {
        assert.ok(logs.every((log) => log.rows[0].classList.contains("is-complete")));
        calls.push(["save"]);
        return { saved };
      },
      workoutElapsedTimerState: { running: true },
      renderCustomWorkoutGroupedCard: () => {},
      customWorkoutGroupedRestAction: null,
      setRestTimerDuration: (seconds) => calls.push(["duration", seconds]),
      resetRestTimer: () => calls.push(["reset"]),
      startOrPauseRestTimer: () => calls.push(["start"])
    });
    const result = await context.logCustomWorkoutGroupedRound(button);
    assert.equal(result.saved, saved);
    assert.deepEqual(calls, saved
      ? [["save"], ...(expectedRest === null ? [] : [["duration", expectedRest]]), ["reset"], ["start"]]
      : [["save"]]);
    assert.equal(context.customWorkoutGroupedRestAction, saved ? restAction : null);
    assert.ok(logs.every((log) => log.rows[0].classList.contains("is-complete") === saved));
  }
});

test("generated target text follows regrouped or manually changed set counts without changing reps, rest, or completion", () => {
  const WorkoutLayout = require("../js/workout-layout.js");
  function logFixture(count, generated = true) {
    const row = (setType) => ({ dataset: { setType }, classList: { contains: () => false } });
    const rows = [row("warm_up"), ...Array.from({ length: count }, () => row("working"))];
    const target = { textContent: "Original target" };
    const host = {
      querySelector: () => ({ dataset: { defaultPlaceholder: "8–12" } }),
      insertAdjacentHTML() { rows.push(row("working")); }
    };
    return {
      rows, target,
      dataset: { setTargetMode: "visible", prescribedSets: String(count), exercisePrescription: `${count} × 8–12`, exerciseRest: "75 seconds", ...(generated ? { generatedExercise: "true" } : {}) },
      querySelectorAll: () => rows,
      querySelector: () => host,
      closest: (selector) => selector === "[data-custom-exercise-card]" ? { querySelector: () => target } : null
    };
  }
  const context = evaluate(["customWorkoutGroupedRows", "normalizeCustomWorkoutGroupedRoundRows", "syncVisibleSetTarget"], {
    WorkoutLayout,
    setTypeForRow: (row) => row.dataset.setType,
    setRowMarkup: () => "<div></div>",
    renumberSetRows: () => {},
    updateVisibleSetProgress: () => {}
  });
  const shorter = logFixture(2);
  const longer = logFixture(3);
  assert.equal(context.normalizeCustomWorkoutGroupedRoundRows([shorter, longer]), true);
  assert.equal(shorter.rows.length, 4, "Regrouping produces one warm-up and three working rows");
  assert.equal(shorter.dataset.prescribedSets, "3");
  assert.equal(WorkoutLayout.prescription(shorter.dataset.exercisePrescription).sets, "3");
  assert.equal(WorkoutLayout.prescription(shorter.dataset.exercisePrescription).reps, "8–12");
  assert.equal(shorter.target.textContent, `Target: ${shorter.dataset.exercisePrescription} · 75 seconds`);
  shorter.rows.pop();
  context.syncVisibleSetTarget(shorter);
  assert.equal(WorkoutLayout.prescription(shorter.dataset.exercisePrescription).sets, "2");
  assert.equal(shorter.dataset.exerciseRest, "75 seconds");
  assert.ok(shorter.rows.every((row) => !row.classList.contains("is-complete")));
  const ordinary = logFixture(2, false);
  ordinary.dataset.exercisePrescription = "Custom sets";
  context.syncVisibleSetTarget(ordinary);
  assert.equal(ordinary.dataset.exercisePrescription, "Custom sets");
  assert.equal(ordinary.target.textContent, "Original target");
});

test("editing a generated exercise clears its old prescription without losing targets on an unchanged name", () => {
  for (const name of ["Goblet squat", "Cable row"]) {
    const target = { hidden: false };
    const card = { querySelector: (selector) => selector === "[data-generated-workout-target]" ? target : null, closest: () => null };
    const log = exerciseLogFixture();
    log.closest = () => card;
    const context = evaluate(["exerciseDisplayName", "syncExerciseNamePreview"], { syncWorkoutExerciseList: () => {} });
    context.syncExerciseNamePreview(log, name);
    if (name === "Goblet squat") {
      assert.equal(log.dataset.generatedExercise, "true");
      assert.equal(log.dataset.exercisePrescription, "3 × 8–12");
      assert.equal(log.dataset.exerciseRest, "75 seconds");
      assert.equal(target.hidden, false);
    } else {
      assert.equal(log.dataset.generatedExercise, undefined);
      assert.equal(log.dataset.exercisePrescription, "Custom sets");
      assert.equal(log.dataset.exerciseRest, "");
      assert.equal(target.hidden, true);
    }
  }
});

test("dashboard loads versioned generator dependencies before the client portal", () => {
  const html = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
  const scripts = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g), (match) => match[1].replaceAll("&amp;", "&"));
  const engine = scripts.findIndex((src) => src.startsWith("js/workout-generator.js?"));
  const dialog = scripts.findIndex((src) => src.startsWith("js/workout-generator-dialog.js?"));
  const portal = scripts.findIndex((src) => src.startsWith("js/client-portal.js?"));
  assert.ok(engine >= 0 && engine < dialog && dialog < portal, "Engine and dialog must load before their portal consumer");
  for (const index of [engine, dialog]) assert.ok(new URL(scripts[index], "https://example.test").searchParams.has("v"));
  assert.ok(new URL(scripts[portal], "https://example.test").searchParams.has("workout-generator"));
  assert.match(html, /<link[^>]+href="css\/workout-generator\.css\?v=[^"]+"/);
});
