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
  return evaluate(["normalizeCustomWorkoutFormat", "customWorkoutExerciseAddConfig", "customWorkoutDefaultExerciseCount", "customWorkoutDefaultExerciseGroup", "customExerciseCode", "customWorkoutDraftExercises", "customWorkoutExercises"], {
    activeCustomWorkoutFormat: "single",
    customWorkoutFormats: { single: {}, superset: {}, circuit: {} },
    activeCustomWorkoutDraft: () => draft,
    normalizeCustomWorkoutInlineGroupType: (value) => value || "single"
  });
}

test("fresh straight sets start with six blank exercises and grouped workouts start with five groups", () => {
  const context = exerciseContext();
  const exercises = plain(context.customWorkoutExercises());
  assert.deepEqual(exercises.map(({ code, name }) => ({ code, name })), [
    { code: "CW01", name: "" }, { code: "CW02", name: "" },
    { code: "CW03", name: "" }, { code: "CW04", name: "" },
    { code: "CW05", name: "" }, { code: "CW06", name: "" }
  ]);
  assert.equal(context.customWorkoutExercises("superset").length, 10);
  assert.equal(context.customWorkoutExercises("circuit").length, 15);
});

test("explicitly removing every exercise stays empty on restore, while older empty drafts keep defaults", () => {
  assert.deepEqual(plain(exerciseContext({ emptyExercises: true, exercises: [] }).customWorkoutExercises()), []);
  assert.equal(exerciseContext({ exercises: [] }).customWorkoutExercises().length, 6);
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
  const adders = [0, 1].map(() => ({ setAttribute(_name, value) { this.label = value; } }));
  let cards = [{}, {}, {}];
  const panel = {
    dataset: { customWorkoutFormat: "superset" },
    classList: { contains: (value) => value === "client-workout-panel-custom" },
    querySelectorAll: (selector) => selector === "[data-custom-exercise-card]" ? cards : selector === "[data-custom-exercise-count]" ? counters : selector === "[data-pick-custom-exercise]" ? adders : removers
  };
  const context = evaluate(["normalizeCustomWorkoutFormat", "customWorkoutExerciseAddConfig", "syncCustomWorkoutExerciseControls"], {
    customWorkoutFormats: { single: {}, superset: {}, circuit: {} }
  });
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(counters.map((counter) => counter.textContent), ["3", "3"]);
  assert.deepEqual(adders.map((button) => button.label), ["Add superset (2 exercises)", "Add superset (2 exercises)"]);
  cards = [];
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(counters.map((counter) => counter.textContent), ["0", "0"]);
  assert.deepEqual(removers.map((button) => button.disabled), [true, true]);
  cards = [{}];
  panel.dataset.customWorkoutFormat = "circuit";
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(removers.map((button) => button.disabled), [false, false]);
  assert.deepEqual(adders.map((button) => button.label), ["Add circuit (3 exercises)", "Add circuit (3 exercises)"]);
});

for (const [format, sizes, addedCount] of [
  ["single", [1, 1, 1, 1], 1], ["superset", [2, 2], 2], ["circuit", [3], 3],
  ["superset", [2, 1], 2], ["circuit", [2], 3], ["superset", [], 2], ["circuit", [], 3]
]) {
  test(`${format} picker adds ${addedCount} fresh exercises after groups [${sizes}], preserving existing entries`, () => {
    let sequence = 0;
    const calls = [];
    function card(exercise, options = {}) {
      const date = { value: "" };
      const log = { dataset: { exerciseCode: exercise.code }, date, querySelector: () => date };
      return { exercise, options, log, dataset: { customWorkoutGroup: String(exercise.group) }, querySelector: () => log };
    }
    function carousel(group) {
      const list = {
        children: [],
        insertAdjacentHTML(_position, markup) {
          const spec = JSON.parse(markup);
          this.children.push(card(spec.exercise, spec.options));
        },
        get lastElementChild() { return this.children.at(-1); }
      };
      return { dataset: { customWorkoutGroup: String(group) }, list, querySelector: () => list };
    }
    const carousels = sizes.map((size, group) => {
      const item = carousel(group);
      // Older superset drafts can display separate pairs while every card still has group 0.
      item.list.children = Array.from({ length: size }, () => card({ code: `CW0${++sequence}`, name: "Existing", group: 0, weight: "35.5", reps: "8", notes: "Keep this", complete: true }));
      return item;
    });
    const allCards = () => carousels.flatMap((item) => item.list.children);
    const before = allCards().map((item) => item.exercise);
    const stack = {
      insertAdjacentHTML(_position, group) { carousels.push(carousel(Number(group))); },
      get lastElementChild() { return carousels.at(-1); }
    };
    const panel = {
      dataset: { customWorkoutFormat: format, customWorkoutTitle: "Current workout" },
      querySelector: (selector) => selector === "[data-workout-date]" ? { value: "2026-09-23" } : stack,
      querySelectorAll: (selector) => selector === "[data-exercise-log]" ? allCards().map((item) => item.log) : allCards()
    };
    const context = evaluate(["normalizeCustomWorkoutFormat", "customWorkoutExerciseAddConfig", "customExerciseCode", "nextCustomExerciseCode", "addCustomWorkoutPickedExercise"], {
      customWorkoutFormats: { single: {}, superset: {}, circuit: {} },
      customWorkoutTitle: "Custom workout", todayDate: () => "2026-09-24",
      trainingLogs: [{ workout_title: "Current workout", entry_date: "2026-09-23", exercise_code: "CW20" }],
      customWorkoutCarousels: () => carousels,
      customWorkoutCarouselCards: (item) => item?.list.children || [],
      customWorkoutCarouselGroupMarkup: (_format, _exercises, group) => String(group),
      customWorkoutCardMarkup: (exercise, _title, index, options) => JSON.stringify({ exercise, options: { ...options, index } }),
      updateExerciseLogField: (log) => calls.push(log.dataset.exerciseCode),
      syncCustomWorkoutCarousel: (_panel, options) => calls.push(options.focusCard),
      persistCustomWorkoutDraftFromPanel: () => calls.push("persist")
    });
    const selected = context.addCustomWorkoutPickedExercise(panel, "  Cable Row  ");
    const added = allCards().slice(before.length);
    assert.equal(added.length, addedCount);
    assert.equal(selected, added[0]);
    assert.deepEqual(added.map((item) => item.exercise.name), ["Cable Row", ...Array(addedCount - 1).fill("")]);
    assert.deepEqual(added.map((item) => item.exercise.code), Array.from({ length: addedCount }, (_, i) => `CW${21 + i}`));
    assert.deepEqual(added.map((item) => item.log.date.value), Array(addedCount).fill("2026-09-23"));
    assert.deepEqual(allCards().slice(0, before.length).map((item) => item.exercise), before);
    assert.deepEqual(calls.slice(-2), [selected, "persist"], "Render once after inserting the entire group, then persist");
    if (format !== "single") {
      assert.deepEqual(carousels.map((item) => item.list.children.length), [...sizes, addedCount]);
      carousels.forEach((item, group) => assert(item.list.children.every((entry) => entry.dataset.customWorkoutGroup === String(group))));
      assert.deepEqual(added.map((item) => item.options.groupPosition), Array.from({ length: addedCount }, (_, i) => i));
    }
  });
}

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

function dialogFixture(format = "single") {
  const handlers = {};
  const calls = { add: [], remove: [], focus: 0 };
  const input = { value: "" };
  const cards = [0, 1, 2].map((index) => ({ querySelector: () => ({ index }) }));
  const panel = { dataset: { customWorkoutFormat: format }, isConnected: true, querySelectorAll: () => cards, contains: (card) => cards.includes(card) };
  const trigger = { isConnected: true, disabled: false, closest: () => panel, focus: () => calls.focus++ };
  const dialog = {
    setAttribute() {}, addEventListener: (name, handler) => { handlers[name] = handler; },
    querySelector: () => input, showModal() {}, remove() {},
    close: () => handlers.close()
  };
  const context = evaluate(["normalizeCustomWorkoutFormat", "customWorkoutExerciseAddConfig", "openCustomWorkoutExerciseDialog"], {
    customWorkoutFormats: { single: {}, superset: {}, circuit: {} },
    document: { querySelector: () => null, createElement: () => dialog, body: { append() {} } },
    escapeHtml: String, currentExerciseLabel: (log) => `Exercise ${log.index + 1}`,
    renderCustomExerciseSuggestions() {},
    removeExerciseLog: (log) => calls.remove.push(log.index),
    addCustomWorkoutPickedExercise: (_panel, name) => { calls.add.push(name); return null; }
  });
  const click = (selector, target = {}) => handlers.click({ stopPropagation() {}, target: { closest: (candidate) => candidate === selector ? target : null } });
  return { context, handlers, calls, trigger, input, click, dialog };
}

test("grouped pickers explain their blank companions and full group count before adding", () => {
  for (const [format, label, count] of [["superset", "Add superset", 2], ["circuit", "Add circuit", 3]]) {
    const fixture = dialogFixture(format);
    fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
    assert(fixture.dialog.innerHTML.includes(`${label} · ${count} exercises`));
    assert(fixture.dialog.innerHTML.includes("Choose the first exercise."));
    assert.deepEqual(fixture.calls.add, []);
  }
});

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
