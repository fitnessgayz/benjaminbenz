const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function declaration(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const rest = source.slice(match.index + match[0].length);
  const end = rest.search(/\n(?:async\s+)?function\s+[\w$]+\s*\(/);
  return source.slice(match.index, end < 0 ? undefined : match.index + match[0].length + end);
}

function evaluate(names, values = {}) {
  const context = vm.createContext(values);
  vm.runInContext(names.map(declaration).join("\n"), context);
  return context;
}

function exerciseContext(draft = null) {
  return evaluate(["normalizeCustomWorkoutFormat", "customWorkoutDefaultExerciseCount", "customExerciseCode", "customWorkoutDraftExercises", "customWorkoutExercises"], {
    activeCustomWorkoutFormat: "single",
    customWorkoutFormats: { single: {}, superset: {}, circuit: {} },
    activeCustomWorkoutDraft: () => draft,
    normalizeCustomWorkoutInlineGroupType: (value) => value || "single"
  });
}

test("fresh straight sets start with four blank exercises while grouped defaults remain two and three", () => {
  const context = exerciseContext();
  const exercises = plain(context.customWorkoutExercises());
  assert.deepEqual(exercises.map(({ code, name }) => ({ code, name })), [
    { code: "CW01", name: "" }, { code: "CW02", name: "" },
    { code: "CW03", name: "" }, { code: "CW04", name: "" }
  ]);
  assert.equal(context.customWorkoutExercises("superset").length, 2);
  assert.equal(context.customWorkoutExercises("circuit").length, 3);
});

test("explicitly removing every exercise stays empty on restore, while older empty drafts keep defaults", () => {
  assert.deepEqual(plain(exerciseContext({ emptyExercises: true, exercises: [] }).customWorkoutExercises()), []);
  assert.equal(exerciseContext({ exercises: [] }).customWorkoutExercises().length, 4);
  const saved = [{ code: "CW03", name: "Cable Row", group: 1, groupType: "superset" }];
  assert.equal(exerciseContext({ exercises: saved }).customWorkoutExercises().length, 1);
  assert.equal(exerciseContext({ exercises: saved }).customWorkoutExercises()[0].name, "Cable Row");
});

test("draft serialization records intentional zero without dropping title, date or copy provenance", () => {
  const previous = { workoutTitle: "Copied workout", copiedFrom: { historyKey: "session:fixture" } };
  const panel = {
    dataset: { customWorkoutFormat: "single", customWorkoutTitle: "Current workout" },
    querySelectorAll: () => [],
    querySelector: (selector) => selector === "[data-workout-date]" ? { value: "2026-09-23" } : null
  };
  const context = evaluate(["customWorkoutPanelDraft"], {
    activeCustomWorkoutDraft: () => previous,
    activeCustomWorkoutFormat: "single", customWorkoutTitle: "Custom workout",
    normalizeCustomWorkoutFormat: (value) => value, todayDate: () => "2026-09-22",
    serializeCustomExerciseDraft: () => { throw new Error("No exercise should be serialized"); }
  });
  assert.deepEqual(plain(context.customWorkoutPanelDraft(panel)), {
    format: "single", date: "2026-09-23", workoutTitle: "Current workout", emptyExercises: true, nextExerciseNumber: 1,
    copiedFrom: previous.copiedFrom, exercises: []
  });
});

test("both exercise counters and remove controls follow canonical cards, including zero", () => {
  const counters = [{ textContent: "9" }, { textContent: "9" }];
  const removers = [{ disabled: false }, { disabled: false }];
  let cards = [{}, {}, {}];
  const panel = {
    classList: { contains: (value) => value === "client-workout-panel-custom" },
    querySelectorAll: (selector) => selector === "[data-custom-exercise-card]" ? cards : selector === "[data-custom-exercise-count]" ? counters : removers
  };
  const context = evaluate(["syncCustomWorkoutExerciseControls"]);
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(counters.map((counter) => counter.textContent), ["3", "3"]);
  cards = [];
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(counters.map((counter) => counter.textContent), ["0", "0"]);
  assert.deepEqual(removers.map((button) => button.disabled), [true, true]);
  cards = [{}];
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(removers.map((button) => button.disabled), [false, false]);
});

test("new exercise identities skip removed saved rows and retained draft numbers", () => {
  const panel = {
    dataset: { customWorkoutTitle: "Current workout" },
    querySelectorAll: () => [{ dataset: { exerciseCode: "CW01" } }, { dataset: { exerciseCode: "CW03" } }],
    querySelector: () => ({ value: "2026-09-23" })
  };
  const context = evaluate(["customExerciseCode", "nextCustomExerciseCode"], {
    customWorkoutTitle: "Custom workout", todayDate: () => "2026-09-23",
    trainingLogs: [
      { workout_title: "Current workout", entry_date: "2026-09-23", exercise_code: "CW09" },
      { workout_title: "Other workout", entry_date: "2026-09-23", exercise_code: "CW40" },
      { workout_title: "Current workout", entry_date: "2026-09-22", exercise_code: "CW50" },
      { workout_title: "Current workout", entry_date: "2026-09-23", exercise_code: "WARMUP" }
    ]
  });
  assert.equal(context.nextCustomExerciseCode(panel), "CW10");
  panel.querySelectorAll = () => [];
  assert.equal(context.nextCustomExerciseCode(panel), "CW10", "Removing all cards cannot reuse a saved log identity");
  panel.dataset.customWorkoutNextExerciseNumber = "12";
  assert.equal(context.nextCustomExerciseCode(panel), "CW12", "A draft must also reserve identities whose saves are still in flight");
});

test("removing a highest-numbered exercise reserves its identity and cancels its pending autosave", () => {
  const calls = [];
  const panel = { dataset: {}, querySelectorAll: () => [] };
  const card = {
    closest: (selector) => selector === ".client-workout-panel-custom" ? panel : null,
    querySelectorAll: () => [log], remove: () => calls.push("remove")
  };
  const log = { closest: () => card };
  const context = evaluate(["removeExerciseLog"], {
    nextCustomExerciseCode: () => "CW08",
    cancelTrainingLogAutosaves: (container) => { assert.equal(container, card); calls.push("cancel"); },
    syncCustomWorkoutFormatMarkers() {}, syncCustomWorkoutCarousel() {},
    syncAssignedWorkoutMarkers() {}, syncAssignedWorkoutCarousels() {},
    persistCustomWorkoutDraftFromPanel: (container) => { assert.equal(container.dataset.customWorkoutNextExerciseNumber, "08"); calls.push("persist"); }
  });
  context.removeExerciseLog(log);
  assert.deepEqual(calls, ["cancel", "remove", "persist"]);
});

test("exercise editor targets the chosen card's first editable working weight without rebuilding its data", () => {
  const focused = [];
  const unchanged = { weight: "35.5", reps: "8", notes: "Keep this", complete: true };
  const fields = [
    { disabled: true, focus: () => assert.fail("Completed input must not receive focus") },
    { disabled: false, focus: () => focused.push("weight"), scrollIntoView: () => focused.push("scroll") }
  ];
  const panel = {};
  let requestedSelector;
  const carousel = { querySelectorAll: (selector) => { requestedSelector = selector; return fields; } };
  const cards = [{}, { data: unchanged, closest: (selector) => selector === ".client-workout-panel-custom" ? panel : carousel }];
  const expanded = [];
  const context = evaluate(["openCustomWorkoutExerciseEditor"], {
    customWorkoutCarouselCards: () => cards,
    setWorkoutExerciseCardExpanded: (card, value) => expanded.push([card, value]),
    customWorkoutEditableNameInput: () => assert.fail("Working inputs are available")
  });
  context.openCustomWorkoutExerciseEditor(cards[1]);
  assert.match(requestedSelector, /data-custom-grouped-exercise-index="1"/);
  assert.deepEqual(expanded, [[cards[1], true]]);
  assert.deepEqual(focused, ["weight", "scroll"]);
  assert.deepEqual(unchanged, { weight: "35.5", reps: "8", notes: "Keep this", complete: true });
});

function dialogFixture() {
  const handlers = {};
  const calls = { add: [], remove: [], focus: 0 };
  const input = { value: "" };
  const cards = [0, 1, 2].map((index) => ({ querySelector: () => ({ index }) }));
  const panel = { isConnected: true, querySelectorAll: () => cards, contains: (card) => cards.includes(card) };
  const trigger = { isConnected: true, disabled: false, closest: () => panel, focus: () => calls.focus++ };
  const dialog = {
    setAttribute() {}, addEventListener: (name, handler) => { handlers[name] = handler; },
    querySelector: () => input, showModal() {}, remove() {},
    close: () => handlers.close()
  };
  const context = evaluate(["openCustomWorkoutExerciseDialog"], {
    document: { querySelector: () => null, createElement: () => dialog, body: { append() {} } },
    escapeHtml: String, currentExerciseLabel: (log) => `Exercise ${log.index + 1}`,
    renderCustomExerciseSuggestions() {},
    removeExerciseLog: (log) => calls.remove.push(log.index),
    addCustomWorkoutPickedExercise: (_panel, name) => { calls.add.push(name); return null; }
  });
  const click = (selector, target = {}) => handlers.click({ stopPropagation() {}, target: { closest: (candidate) => candidate === selector ? target : null } });
  return { context, handlers, calls, trigger, input, click };
}

test("closing exercise pickers changes nothing and restores the triggering control", () => {
  for (const mode of ["add", "remove"]) {
    const fixture = dialogFixture();
    fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger, mode);
    fixture.click("[data-close-exercise-dialog]");
    assert.deepEqual(fixture.calls, { add: [], remove: [], focus: 1 });
  }
});

test("remove dialog deletes only the selected middle exercise", () => {
  const fixture = dialogFixture();
  fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger, "remove");
  fixture.click("[data-remove-exercise-choice]", { dataset: { removeExerciseChoice: "1" } });
  assert.deepEqual(fixture.calls.remove, [1]);
  assert.deepEqual(fixture.calls.add, []);
});

test("empty picker submission does not add a card and a named submission adds exactly once", () => {
  const fixture = dialogFixture();
  fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
  const event = { preventDefault() {}, stopPropagation() {} };
  fixture.input.value = "   ";
  fixture.handlers.submit(event);
  assert.deepEqual(fixture.calls.add, []);
  fixture.input.value = "  Cable Row  ";
  fixture.handlers.submit(event);
  assert.deepEqual(fixture.calls.add, ["Cable Row"]);
});

test("exercise key opens its matching editor while a nested demo link keeps its own behavior", async () => {
  const listeners = {};
  const opened = [];
  const cards = [{ code: "CW01" }, { code: "CW02" }];
  const key = { closest: () => ({}), querySelector: () => ({ dataset: { openCustomExercise: "1" } }) };
  const context = evaluate(["handleWorkoutInteractions"], {
    document: { addEventListener: (name, handler) => { listeners[name] = handler; } },
    customWorkoutCarouselCards: () => cards,
    closeCustomExerciseSuggestions() {},
    openCustomWorkoutExerciseEditor: (card) => opened.push(card)
  });
  context.handleWorkoutInteractions();
  const event = (nested) => ({ target: {
    matches: () => false,
    closest: (selector) => selector === ".client-workout-panel-custom .custom-workout-grouped-exercise-key-item"
      ? key : selector === "button, input, select, textarea, a, label, summary, [contenteditable]" && nested ? {} : null
  } });
  await listeners.click(event(false));
  assert.deepEqual(opened, [cards[1]]);
  await listeners.click(event(true));
  assert.deepEqual(opened, [cards[1]], "Nested demo links must not re-open the exercise editor");
});
