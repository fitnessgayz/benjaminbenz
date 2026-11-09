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

test("new custom workouts start with no exercises in every format", () => {
  const context = exerciseContext();
  assert.equal(context.customWorkoutExercises().length, 0);
  assert.equal(context.customWorkoutExercises("superset").length, 0);
  assert.equal(context.customWorkoutExercises("circuit").length, 0);
});

test("empty drafts gain starter slots and saved exercises are retained", () => {
  assert.equal(exerciseContext({ emptyExercises: true, exercises: [] }).customWorkoutExercises().length, 0);
  assert.equal(exerciseContext({ exercises: [] }).customWorkoutExercises().length, 0);
  const saved = [{ code: "CW03", name: "Cable Row", group: 1, groupType: "superset" }];
  assert.equal(exerciseContext({ exercises: saved }).customWorkoutExercises().length, 1);
  assert.equal(exerciseContext({ exercises: saved }).customWorkoutExercises()[0].name, "Cable Row");
});

test("legacy blank placeholders disappear but entered set values remain", () => {
  const blanks = Array.from({ length: 6 }, (_, index) => ({ code: `CW0${index + 1}`, name: "", sets: [{ weight: "", reps: "", complete: false }] }));
  assert.equal(exerciseContext({ exercises: blanks }).customWorkoutExercises().length, 0);
  blanks[2].sets[0].weight = "45";
  assert.equal(exerciseContext({ exercises: blanks }).customWorkoutExercises().length, 6);
});

test("exercise picker fills the next blank slot before appending", () => {
  const input = { value: "", blurred: false, dispatchEvent() {}, blur() { this.blurred = true; } };
  const log = { dataset: { exerciseName: "" } };
  const card = { querySelector: (selector) => selector === "[data-exercise-log]" ? log : input };
  let persisted = 0;
  const panel = {
    dataset: { customWorkoutFormat: "single" },
    querySelector: () => ({}),
    querySelectorAll: () => [card]
  };
  const context = evaluate(["addCustomWorkoutPickedExercise"], {
    normalizeCustomWorkoutFormat: (value) => value || "single",
    customWorkoutExerciseAddConfig: () => ({ count: 1 }),
    customWorkoutCarousels: () => [],
    customWorkoutEditableNameInput: () => input,
    persistCustomWorkoutDraftFromPanel: () => { persisted += 1; },
    Event: class {}
  });
  assert.equal(context.addCustomWorkoutPickedExercise(panel, "  Cable Row  "), card);
  assert.equal(input.value, "Cable Row");
  assert.equal(input.blurred, true);
  assert.equal(persisted, 1);
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
    serializeCustomExerciseDraft: () => { throw new Error("No exercise should be serialized"); },
    workoutGymLocationForElement: () => ""
  });
  assert.deepEqual(plain(context.customWorkoutPanelDraft(panel)), {
    format: "single", gymName: "", date: "2026-09-23", workoutTitle: "Current workout", emptyExercises: true, nextExerciseNumber: 1,
    copiedFrom: previous.copiedFrom, exercises: []
  });
});

test("a selected exercise draft survives a fresh page context", () => {
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key)
  };
  const names = ["customWorkoutDraftKey", "readCustomWorkoutDraft", "storeCustomWorkoutDraft", "activeCustomWorkoutDraft"];
  const values = {
    currentProgram: { id: "program-1", client_email: "client@example.com" },
    activeClientEmail: "client@example.com", customWorkoutDraftVersion: 2,
    window: { localStorage }, todayDate: () => {
      const now = new Date();
      return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    },
    upgradeCustomWorkoutDraft: (draft) => draft, clearCustomWorkoutDraft: () => assert.fail("Current draft must not be cleared")
  };
  const firstPage = evaluate(names, values);
  firstPage.storeCustomWorkoutDraft({ format: "single", exercises: [{ code: "CW01", name: "Leg Press" }] });
  const reloadedPage = evaluate(names, values);
  assert.equal(reloadedPage.activeCustomWorkoutDraft().exercises[0].name, "Leg Press");
});

test("both exercise counters and remove controls follow canonical cards, including zero", () => {
  const counters = [{ textContent: "9" }, { textContent: "9" }];
  const removers = [{ disabled: false }, { disabled: false }];
  const adders = [0, 1].map(() => ({ setAttribute(_name, value) { this.label = value; } }));
  let cards = [{}, {}, {}];
  const panel = {
    dataset: { customWorkoutFormat: "superset" },
    classList: { contains: (value) => value === "client-workout-panel-custom", toggle() {} },
    querySelector: () => null,
    querySelectorAll: (selector) => selector === "[data-custom-exercise-card]" ? cards : selector === "[data-custom-exercise-count]" ? counters : selector === "[data-pick-custom-exercise]" ? adders : removers
  };
  const context = evaluate(["normalizeCustomWorkoutFormat", "customWorkoutExerciseAddConfig", "syncCustomWorkoutExerciseControls"], {
    customWorkoutFormats: { single: {}, superset: {}, circuit: {} }
  });
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(counters.map((counter) => counter.textContent), ["3", "3"]);
  assert.deepEqual(adders.map((button) => button.label), ["Add exercise", "Add exercise"]);
  cards = [];
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(counters.map((counter) => counter.textContent), ["0", "0"]);
  assert.deepEqual(removers.map((button) => button.disabled), [true, true]);
  cards = [{}];
  panel.dataset.customWorkoutFormat = "circuit";
  context.syncCustomWorkoutExerciseControls(panel);
  assert.deepEqual(removers.map((button) => button.disabled), [false, false]);
  assert.deepEqual(adders.map((button) => button.label), ["Add exercise", "Add exercise"]);
});

for (const [format, sizes, addedCount] of [
  ["single", [1, 1, 1, 1], 1], ["superset", [2, 2], 2], ["circuit", [3], 3],
  ["superset", [2, 1], 1], ["circuit", [2], 1], ["superset", [], 2], ["circuit", [], 3]
]) {
  test(`${format} picker adds ${addedCount} fresh exercises after groups [${sizes}], preserving existing entries`, () => {
    let sequence = 0;
    const calls = [];
    function card(exercise, options = {}) {
      const date = { value: "" };
      const log = { dataset: { exerciseCode: exercise.code, exerciseName: exercise.name }, date, querySelector: () => date };
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
      const fillsLastGroup = sizes.length > 0 && sizes.at(-1) < context.customWorkoutExerciseAddConfig(format).count;
      const expectedSizes = fillsLastGroup
        ? [...sizes.slice(0, -1), sizes.at(-1) + addedCount]
        : [...sizes, addedCount];
      assert.deepEqual(carousels.map((item) => item.list.children.length), expectedSizes);
      carousels.forEach((item, group) => assert(item.list.children.every((entry) => entry.dataset.customWorkoutGroup === String(group))));
      const firstPosition = fillsLastGroup ? sizes.at(-1) : 0;
      assert.deepEqual(added.map((item) => item.options.groupPosition), Array.from({ length: addedCount }, (_, i) => firstPosition + i));
    }
  });
}

test("successive picks fill the current superset or circuit before starting the next group", () => {
  for (const [format, size] of [["superset", 2], ["circuit", 3]]) {
    let sequence = 0;
    const carousels = [];
    const makeCard = (exercise) => {
      const log = { dataset: { exerciseCode: exercise.code, exerciseName: exercise.name }, querySelector: () => ({ value: "" }) };
      const input = {
        value: exercise.name,
        dispatchEvent() { exercise.name = this.value; log.dataset.exerciseName = this.value; },
        blur() {}
      };
      return { exercise, log, input, dataset: { customWorkoutGroup: String(exercise.group) },
        querySelector: (selector) => selector === "[data-exercise-log]" ? log : input };
    };
    const makeCarousel = (group) => {
      const list = { children: [], insertAdjacentHTML(_position, markup) {
        this.children.push(makeCard(JSON.parse(markup).exercise));
      }, get lastElementChild() { return this.children.at(-1); } };
      return { dataset: { customWorkoutGroup: String(group) }, list, querySelector: () => list };
    };
    const allCards = () => carousels.flatMap((carousel) => carousel.list.children);
    const stack = { insertAdjacentHTML(_position, group) { carousels.push(makeCarousel(Number(group))); },
      get lastElementChild() { return carousels.at(-1); } };
    const panel = { dataset: { customWorkoutFormat: format, customWorkoutTitle: "Custom workout" },
      querySelector: (selector) => selector === "[data-workout-date]" ? { value: "2026-10-30" } : stack,
      querySelectorAll: (selector) => selector === "[data-exercise-log]" ? allCards().map((card) => card.log) : allCards() };
    const context = evaluate(["normalizeCustomWorkoutFormat", "customWorkoutExerciseAddConfig", "customExerciseCode", "nextCustomExerciseCode", "addCustomWorkoutPickedExercise"], {
      customWorkoutFormats: { single: {}, superset: {}, circuit: {} },
      customWorkoutTitle: "Custom workout", todayDate: () => "2026-10-30", trainingLogs: [], Event: class {},
      customWorkoutCarousels: () => carousels,
      customWorkoutCarouselCards: (carousel) => carousel?.list.children || [],
      customWorkoutCarouselGroupMarkup: (_format, _exercises, group) => String(group),
      customWorkoutCardMarkup: (exercise) => JSON.stringify({ exercise }),
      customWorkoutEditableNameInput: (card) => card.input,
      updateExerciseLogField() {}, syncCustomWorkoutCarousel() {}, persistCustomWorkoutDraftFromPanel() {}
    });
    for (let index = 0; index < size + 1; index += 1) {
      context.addCustomWorkoutPickedExercise(panel, `Exercise ${++sequence}`);
    }
    assert.deepEqual(carousels.map((carousel) => carousel.list.children.length), [size, size]);
    assert.deepEqual(carousels[0].list.children.map((card) => card.exercise.name),
      Array.from({ length: size }, (_, index) => `Exercise ${index + 1}`));
    assert.equal(carousels[1].list.children[0].exercise.name, `Exercise ${size + 1}`);
    assert(carousels[1].list.children.slice(1).every((card) => card.exercise.name === ""));
  }
});

test("a single picker confirmation fills superset pairs and an extended circuit", () => {
  for (const [format, names, expectedSizes] of [
    ["superset", ["Bench Press", "Cable Row", "Curl", "Triceps Pushdown"], [2, 2]],
    ["circuit", ["Squat", "Push-up", "Row", "Jump Rope"], [4]]
  ]) {
    const carousels = [];
    const makeCard = (exercise) => {
      const log = { dataset: { exerciseCode: exercise.code, exerciseName: exercise.name }, querySelector: () => ({ value: "" }) };
      const input = { value: exercise.name, dispatchEvent() { exercise.name = this.value; log.dataset.exerciseName = this.value; }, blur() {} };
      return { exercise, log, input, dataset: { customWorkoutGroup: String(exercise.group) },
        querySelector: (selector) => selector === "[data-exercise-log]" ? log : input };
    };
    const makeCarousel = (group) => {
      const list = { children: [], insertAdjacentHTML(_position, markup) { this.children.push(makeCard(JSON.parse(markup).exercise)); },
        get lastElementChild() { return this.children.at(-1); } };
      return { dataset: { customWorkoutGroup: String(group) }, list, contains: (card) => list.children.includes(card),
        querySelector: () => list };
    };
    const allCards = () => carousels.flatMap((carousel) => carousel.list.children);
    const stack = { insertAdjacentHTML(_position, group) { carousels.push(makeCarousel(Number(group))); },
      get lastElementChild() { return carousels.at(-1); } };
    const panel = { dataset: { customWorkoutFormat: format, customWorkoutTitle: "Custom workout" },
      querySelector: (selector) => selector === "[data-workout-date]" ? { value: "2026-11-06" } : stack,
      querySelectorAll: (selector) => selector === "[data-exercise-log]" ? allCards().map((card) => card.log) : allCards() };
    const context = evaluate(["normalizeCustomWorkoutFormat", "customWorkoutExerciseAddConfig", "customExerciseCode", "nextCustomExerciseCode", "addCustomWorkoutPickedExercise", "addCustomWorkoutPickedExercises"], {
      customWorkoutFormats: { single: {}, superset: {}, circuit: {} }, customWorkoutTitle: "Custom workout",
      trainingLogs: [], todayDate: () => "2026-11-06", Event: class {},
      customWorkoutCarousels: () => carousels, customWorkoutCarouselCards: (carousel) => carousel?.list.children || [],
      customWorkoutCarouselGroupMarkup: (_format, _exercises, group) => String(group),
      customWorkoutCardMarkup: (exercise) => JSON.stringify({ exercise }), customWorkoutEditableNameInput: (card) => card.input,
      updateExerciseLogField() {}, syncCustomWorkoutCarousel() {}, persistCustomWorkoutDraftFromPanel() {}
    });
    context.addCustomWorkoutPickedExercises(panel, names);
    assert.deepEqual(carousels.map((carousel) => carousel.list.children.length), expectedSizes);
    assert.deepEqual(allCards().map((card) => card.exercise.name), names);
    assert(allCards().every((card) => card.exercise.name && card.log.dataset.exerciseName));
  }
});

test("custom exercise notification passes selected names to the secured RPC", async () => {
  const calls = [];
  const context = evaluate(["notifyCoachAboutCustomExercises"], {
    supabaseClient: { rpc: async (...args) => { calls.push(args); return { error: null }; } },
    console: { warn: () => { throw new Error("Unexpected notification failure"); } }
  });
  context.notifyCoachAboutCustomExercises(["Machine Lat Pulldown", "New Cable Raise"]);
  await Promise.resolve();
  assert.deepEqual(plain(calls), [["notify_coach_custom_exercises", { p_names: ["Machine Lat Pulldown", "New Cable Raise"] }]]);
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

function dialogFixture(format = "single") {
  const handlers = {};
  const calls = { add: [], remove: [], focus: 0 };
  const input = { value: "", setAttribute() {}, removeAttribute() {}, focus() {} };
  const selectedCount = { textContent: "" };
  const selected = { hidden: true, querySelector: () => selectedCount };
  const selectedList = { innerHTML: "" };
  const prompt = { textContent: "" };
  const submit = { disabled: false, textContent: "", setAttribute(name, value) { this[name] = value; } };
  const menu = { hidden: true };
  const cards = [0, 1, 2].map((index) => ({ querySelector: () => ({ index }) }));
  const panel = { id: "client-workout-panel-0", dataset: { customWorkoutFormat: format }, isConnected: true, matches: () => true, querySelectorAll: () => cards, contains: (card) => cards.includes(card) };
  const trigger = { isConnected: true, disabled: false, closest: (selector) => selector === ".client-workout-panel-custom" ? panel : null, focus: () => calls.focus++ };
  const dialog = {
    classList: { names: new Set(), toggle(name, enabled) { if (enabled) this.names.add(name); else this.names.delete(name); }, contains(name) { return this.names.has(name); } },
    setAttribute() {}, addEventListener: (name, handler) => { handlers[name] = handler; },
    querySelector: (selector) => ({
      "#custom-workout-picker-search": input,
      "[data-workout-picker-selected]": selected,
      "[data-workout-picker-selected-list]": selectedList,
      "[data-workout-picker-prompt]": prompt,
      '[data-custom-exercise-suggestions]': menu,
      'button[type="submit"]': submit
    })[selector] || input,
    isConnected: true, showModal() {}, remove() {},
    close: () => handlers.close()
  };
  const context = evaluate(["normalizeCustomWorkoutFormat", "customWorkoutExerciseAddConfig", "openCustomWorkoutExerciseDialog"], {
    customWorkoutFormats: { single: {}, superset: {}, circuit: {} },
    document: { querySelector: () => null, createElement: () => dialog, body: { append() {} } },
    escapeHtml: String, currentExerciseLabel: (log) => `Exercise ${log.index + 1}`,
    customWorkoutCarousels: () => [],
    renderCustomExerciseSuggestions() {}, renderCustomWorkoutPickerResults() {},
    selectCustomExerciseSuggestion: (suggestion) => { input.value = suggestion.dataset.customExerciseSuggestion; },
    removeExerciseLog: (log) => calls.remove.push(log.index),
    notifyCoachAboutCustomExercises() {},
    addCustomWorkoutPickedExercise: (_panel, name) => { calls.add.push(name); return { isConnected: false }; },
    addCustomWorkoutPickedExercises: (_panel, names) => { calls.add.push(...names); return { isConnected: false }; }
  });
  const click = (selector, target = {}) => handlers.click({ stopPropagation() {}, target: { closest: (candidate) => candidate === selector ? target : null } });
  return { context, handlers, calls, trigger, input, click, dialog, panel, selectedList, prompt, submit };
}

test("picker asks for the full superset or circuit before adding it", () => {
  for (const [format, minimum] of [["single", 1], ["superset", 2], ["circuit", 3]]) {
    const fixture = dialogFixture(format);
    fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
    assert.match(fixture.dialog.innerHTML, new RegExp(`Add ${format === "single" ? "exercise" : format}`));
    if (minimum > 1) {
      assert.match(fixture.dialog.innerHTML, new RegExp(`STEP 1 · PICK FIRST EXERCISE`));
      assert.match(fixture.dialog.innerHTML, /data-workout-picker-selected-list/);
      assert.equal(fixture.submit.disabled, true);
    }
    assert.deepEqual(fixture.calls.add, []);
  }
});

test("straight sets stage a suggestion until Add exercise is pressed", () => {
  const fixture = dialogFixture("single");
  fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
  assert.match(fixture.dialog.className, /is-grouped-picker/);
  assert.match(fixture.dialog.innerHTML, /data-picker-chip="recent"/);
  assert.match(fixture.dialog.innerHTML, /data-custom-exercise-browse/);
  assert.match(fixture.dialog.innerHTML, /Browse full library/);
  fixture.click("[data-custom-exercise-suggestion]", {
    dataset: { customExerciseSuggestion: "Hip Thrust Machine" }
  });
  assert.deepEqual(fixture.calls.add, []);
  assert.equal(fixture.input.value, "Hip Thrust Machine");
  fixture.handlers.submit({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(fixture.calls.add, ["Hip Thrust Machine"]);
});

test("workout setup chips open only their matching popup and keep summary labels current", () => {
  const labels = { date: { textContent: "" }, gym: { textContent: "" }, format: { textContent: "" } };
  const dateInput = { value: "2026-11-06", showPicker() { calls.push("calendar"); } };
  const gymInput = { value: "Alex Fitness", focus() { calls.push("gym focus"); } };
  const formatPicker = { open: false };
  const heading = { textContent: "" };
  const calls = [];
  const dialog = {
    dataset: {},
    showModal() { calls.push("open"); },
    querySelector(selector) {
      return {
        "[data-custom-workout-setup-title]": heading,
        "[data-workout-date]": dateInput,
        "[data-workout-gym]": gymInput,
        ".custom-workout-format-picker": formatPicker
      }[selector];
    }
  };
  const panel = {
    classList: { contains: () => true },
    dataset: { customWorkoutFormat: "superset" },
    querySelector(selector) {
      return {
        "[data-workout-date]": dateInput,
        "[data-workout-gym]": gymInput,
        "[data-custom-workout-summary-date]": labels.date,
        "[data-custom-workout-summary-gym]": labels.gym,
        "[data-custom-workout-summary-format]": labels.format,
        "[data-custom-workout-setup-dialog]": dialog
      }[selector];
    }
  };
  const context = evaluate(["syncCustomWorkoutSetupSummary", "openCustomWorkoutSetupDialog"], {
    todayDate: () => "2026-11-06",
    formatLogDate: () => "Nov 6, 2026",
    normalizeWorkoutGymName: String,
    normalizeCustomWorkoutFormat: String,
    customWorkoutFormats: { superset: { label: "Superset" } }
  });
  context.syncCustomWorkoutSetupSummary(panel);
  assert.deepEqual(Object.values(labels).map((label) => label.textContent), ["Nov 6", "Alex Fitness", "Superset"]);
  const open = (section) => context.openCustomWorkoutSetupDialog({
    dataset: { customWorkoutSetupOpen: section },
    closest: () => panel
  });
  open("date");
  assert.equal(dialog.dataset.section, "date");
  assert.equal(heading.textContent, "Workout date");
  assert.deepEqual(calls, ["open", "calendar"]);
  open("gym");
  assert.equal(dialog.dataset.section, "gym");
  assert.deepEqual(calls.slice(-2), ["open", "gym focus"]);
  open("format");
  assert.equal(dialog.dataset.section, "format");
  assert.equal(formatPicker.open, true);
});

test("grouped picker keeps Add directly below selected exercises", () => {
  for (const format of ["superset", "circuit"]) {
    const fixture = dialogFixture(format);
    fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
    const markup = fixture.dialog.innerHTML;
    const selectedList = markup.indexOf("data-workout-picker-selected-list");
    const addButton = markup.indexOf("data-workout-picker-submit");
    const searchRow = markup.indexOf("custom-workout-picker-search-row");
    const results = markup.indexOf("data-custom-exercise-suggestions");
    assert.ok(selectedList < addButton && addButton < searchRow && searchRow < results);
    assert.doesNotMatch(markup, /autofocus required/, "Selected exercises must submit with an empty search field");
  }
});

test("superset picker collects two exercises before one add action", () => {
  const fixture = dialogFixture("superset");
  fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
  assert.equal(fixture.prompt.textContent, "STEP 1 OF 2 · PICK FIRST EXERCISE");
  const choose = (name) => fixture.click("[data-custom-exercise-suggestion]", { dataset: { customExerciseSuggestion: name } });
  choose("Cable Row");
  assert.equal(fixture.prompt.textContent, "STEP 2 OF 2 · PICK SECOND EXERCISE");
  assert.deepEqual(fixture.calls.add, []);
  assert.equal(fixture.submit.disabled, true);
  fixture.input.value = "Unqueued search text";
  fixture.handlers.submit({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(fixture.calls.add, [], "Search text is not selected until queued");
  choose("Lat Pulldown");
  assert.equal(fixture.prompt.textContent, "PAIR READY · 2 SELECTED");
  assert.equal(fixture.submit.disabled, false);
  assert.equal(fixture.dialog.classList.contains("is-ready-to-add"), true);
  fixture.input.value = "Unselected search text";
  fixture.handlers.submit({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(fixture.calls.add, ["Cable Row", "Lat Pulldown"]);
});

test("a typed manual exercise can be queued before the next superset choice", () => {
  const fixture = dialogFixture("superset");
  fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
  assert.match(fixture.dialog.innerHTML, /data-workout-picker-queue-typed/);
  fixture.input.value = "Custom Cable Pull";
  fixture.click("[data-workout-picker-queue-typed]");
  assert.equal(fixture.input.value, "");
  assert.match(fixture.selectedList.innerHTML, /Custom Cable Pull/);
  fixture.click("[data-custom-exercise-suggestion]", { dataset: { customExerciseSuggestion: "Cable Row" } });
  fixture.handlers.submit({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(fixture.calls.add, ["Custom Cable Pull", "Cable Row"]);
});

test("circuit picker accepts a fourth exercise and lets clients remove a choice", () => {
  const fixture = dialogFixture("circuit");
  fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
  const choose = (name) => fixture.click("[data-custom-exercise-suggestion]", { dataset: { customExerciseSuggestion: name } });
  choose("Squat");
  assert.equal(fixture.prompt.textContent, "STEP 2 OF 3 · PICK SECOND EXERCISE");
  choose("Push-Up");
  assert.equal(fixture.prompt.textContent, "STEP 3 OF 3 · PICK THIRD EXERCISE");
  choose("Row");
  assert.equal(fixture.prompt.textContent, "CIRCUIT READY · 3 SELECTED");
  choose("Jump Rope");
  assert.equal(fixture.submit.disabled, false);
  fixture.click("[data-workout-picker-remove]", { dataset: { workoutPickerRemove: "1" } });
  assert.match(fixture.selectedList.innerHTML, /Jump Rope/);
  fixture.handlers.submit({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(fixture.calls.add, ["Squat", "Row", "Jump Rope"]);
});

test("closing exercise pickers changes nothing and restores the triggering control", () => {
  for (const mode of ["add", "remove"]) {
    const fixture = dialogFixture();
    fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger, mode);
    fixture.click("[data-close-exercise-dialog]");
    assert.deepEqual(fixture.calls, { add: [], remove: [], focus: 1 });
  }
});

test("mobile exercise search waits for typing to pause before refreshing suggestions", () => {
  const fixture = dialogFixture();
  fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
  let refreshes = 0;
  let pending = null;
  fixture.context.renderCustomWorkoutPickerResults = () => { refreshes++; };
  fixture.context.window = {
    setTimeout(callback) { pending = callback; return 1; },
    clearTimeout() { pending = null; }
  };
  fixture.dialog.isConnected = true;
  fixture.input.setAttribute = () => {};
  const target = Object.assign(fixture.input, { matches: (selector) => selector === "#custom-workout-picker-search" });
  fixture.handlers.input({ stopPropagation() {}, target, isComposing: true });
  assert.equal(pending, null);
  fixture.handlers.compositionend({ target });
  assert.equal(refreshes, 0);
  assert.equal(typeof pending, "function");
  fixture.handlers.input({ stopPropagation() {}, target, isComposing: false });
  assert.equal(refreshes, 0);
  pending();
  assert.equal(refreshes, 1);
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

test("exercise selection survives a workout panel refresh while the picker is open", () => {
  const fixture = dialogFixture();
  fixture.context.openCustomWorkoutExerciseDialog(fixture.trigger);
  const currentPanel = { id: fixture.panel.id, isConnected: true, matches: () => true };
  fixture.panel.isConnected = false;
  fixture.context.document.getElementById = () => currentPanel;
  let target = null;
  fixture.context.addCustomWorkoutPickedExercise = (panel, name) => { target = { panel, name }; return null; };
  fixture.input.value = "Lat Pulldown Machine";
  fixture.handlers.submit({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(target, { panel: currentPanel, name: "Lat Pulldown Machine" });
});

test("custom builder search results include primary and secondary muscles", () => {
  const library = [{
    name: "45-Degree Back Extension",
    aliases: [],
    primary_muscle: "glutes",
    secondary_muscles: ["hamstrings", "erector_spinae", "glutes"]
  }];
  const context = evaluate([
    "approvedExerciseForName", "exerciseSuggestionRecords", "exerciseSuggestionMuscleLabel",
    "customExerciseSuggestionMatches"
  ], {
    exerciseLibraryEntries: library,
    exerciseNameMatcher: null,
    currentProgram: null,
    trainingLogs: [],
    warmupExerciseCode: "WARMUP",
    cardioExerciseCode: "CARDIO"
  });

  const matches = plain(context.customExerciseSuggestionMatches("back extension"));
  assert.equal(matches[0].name, "45-Degree Back Extension");
  assert.equal(matches[0].muscleLabel, "Glutes · Hamstrings · Erector Spinae");
});

test("custom builder finds the lat pulldown machine alias", () => {
  const context = evaluate([
    "approvedExerciseForName", "exerciseSuggestionRecords", "exerciseSuggestionMuscleLabel",
    "customExerciseSuggestionMatches"
  ], {
    exerciseLibraryEntries: [{ name: "Lat Pulldown", aliases: ["Lat Pulldown Machine"], primary_muscle: "back" }],
    exerciseNameMatcher: require("../js/exercise-name-matcher.js"),
    currentProgram: null, trainingLogs: [], warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO"
  });
  assert.equal(context.customExerciseSuggestionMatches("lat pulldown machine")[0]?.name, "Lat Pulldown");
});

test("typing Che offers chest word prefixes without crunches or unrelated fuzzy matches", () => {
  const library = [
    { name: "Abs Crunches", aliases: [], primary_muscle: "abs" },
    { name: "Archer Push-Up", aliases: [], primary_muscle: "chest" },
    { name: "Cable Chest Fly", aliases: [], primary_muscle: "chest" },
    { name: "Alternating Dumbbell Chest Press", aliases: [], primary_muscle: "chest", secondary_muscles: ["triceps"] }
  ];
  const context = evaluate([
    "approvedExerciseForName", "exerciseSuggestionRecords", "exerciseSuggestionMuscleLabel",
    "customExerciseSuggestionMatches"
  ], {
    exerciseLibraryEntries: library,
    exerciseNameMatcher: require("../js/exercise-name-matcher.js"),
    currentProgram: null, trainingLogs: [], warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO"
  });
  const matches = plain(context.customExerciseSuggestionMatches("Che"));
  assert.deepEqual(matches.map((match) => match.name).sort(), ["Alternating Dumbbell Chest Press", "Cable Chest Fly"]);
  assert.equal(matches.find((match) => match.name.includes("Press")).muscleLabel, "Chest · Triceps");
  assert.deepEqual(plain(context.customExerciseSuggestionMatches("no such exercise")), []);
  assert.deepEqual(plain(context.customExerciseSuggestionMatches("")), []);
});

test("exercise search indexes are reused until source data changes", () => {
  const library = [{ name: "Lat Pulldown", aliases: ["Pulldown"] }];
  const historyLookup = () => new Map();
  const context = evaluate([
    "invalidateExerciseSearchCaches", "approvedExerciseForName", "exerciseSuggestionRecords"
  ], {
    exerciseLibraryEntries: library,
    exerciseNameMatcher: null,
    currentProgram: null,
    trainingLogs: [{ exercise_name: "Goblet Squat", exercise_code: "A1" }],
    warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO",
    exerciseHistoryLookup: historyLookup
  });

  const first = context.exerciseSuggestionRecords();
  assert.equal(context.exerciseSuggestionRecords(), first);
  assert.equal(context.approvedExerciseForName(" pulldown ").name, "Lat Pulldown");
  library.push({ name: "Cable Row", aliases: [] });
  context.invalidateExerciseSearchCaches();
  assert.notEqual(context.exerciseSuggestionRecords(), first);
  assert.equal(context.approvedExerciseForName("Cable Row").name, "Cable Row");
});

test("exercise-name refreshes coalesce while typing and flush on demand", () => {
  let nextTimer = 0;
  const callbacks = new Map();
  const cleared = [];
  const window = {
    setTimeout(callback) { const id = ++nextTimer; callbacks.set(id, callback); return id; },
    clearTimeout(id) { cleared.push(id); callbacks.delete(id); }
  };
  const context = evaluate(["flushExerciseNameRefresh", "scheduleExerciseNameRefresh"], {
    window,
    exerciseNameRefreshTimers: new WeakMap(),
    exerciseNameRefreshDelay: 120
  });
  const input = {};
  const calls = [];
  context.scheduleExerciseNameRefresh(input, () => calls.push("first"));
  context.scheduleExerciseNameRefresh(input, () => calls.push("second"));
  assert.deepEqual(cleared, [1]);
  assert.equal(context.flushExerciseNameRefresh(input), true);
  assert.deepEqual(calls, ["second"]);
  assert.equal(context.flushExerciseNameRefresh(input), false);
});

test("custom builder renders muscles directly below the exercise name", () => {
  const menu = { innerHTML: "", hidden: true };
  const card = { classList: { toggle() {} } };
  const editor = { querySelector: () => menu, closest: () => card };
  const input = { value: "back", dataset: {}, closest: () => editor, setAttribute() {} };
  const context = evaluate(["exerciseMuscleHighlightKey", "exerciseMuscleHighlightMarkup", "renderCustomExerciseSuggestions"], {
    customExerciseSuggestionMatches: () => [{
      name: "45-Degree Back Extension",
      recommended: false,
      muscleLabel: "Glutes · Hamstrings",
      libraryEntry: { primary_muscle: "glutes", secondary_muscles: ["hamstrings"] }
    }],
    escapeHtml: String,
    closeCustomExerciseSuggestions() {}
  });

  context.renderCustomExerciseSuggestions(input);
  assert.match(menu.innerHTML, /images\/muscle-highlights\/library\/glutes--hamstrings\.png/);
  assert.match(menu.innerHTML, /<strong>45-Degree Back Extension<\/strong>\s*<span class="custom-workout-suggestion-muscles">Glutes · Hamstrings<\/span>/);
  assert.equal(menu.hidden, false);
});

test("selected exercise suggestions stay closed until the name is edited again", () => {
  const menu = { innerHTML: "", hidden: true };
  const card = { classList: { toggle() {} } };
  const editor = { querySelector: () => menu, closest: () => card };
  const input = { value: "Cable Row", dataset: { exerciseSuggestionSelected: "Cable Row" }, closest: () => editor, setAttribute() {} };
  let closes = 0;
  const context = evaluate(["exerciseMuscleHighlightKey", "exerciseMuscleHighlightMarkup", "renderCustomExerciseSuggestions"], {
    customExerciseSuggestionMatches: () => [{ name: "Cable Row", recommended: false, muscleLabel: "Back" }],
    escapeHtml: String, closeCustomExerciseSuggestions: () => { closes++; }
  });
  context.renderCustomExerciseSuggestions(input);
  assert.equal(closes, 1);
  assert.equal(menu.hidden, true);
  input.value = "Cable";
  context.renderCustomExerciseSuggestions(input);
  assert.equal(menu.hidden, false);
  assert.match(menu.innerHTML, /Cable Row/);
});

test("exercise key opens its matching editor while a nested demo link keeps its own behavior", async () => {
  const listeners = {};
  const opened = [];
  const cards = [{ code: "CW01" }, { code: "CW02" }];
  const key = { closest: () => ({}), querySelector: () => ({ dataset: { changeCustomExercise: "1" } }) };
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
