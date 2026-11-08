const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "../client-dashboard.html"), "utf8");
const logStyles = fs.readFileSync(path.join(__dirname, "../css/client-logs-compact.css"), "utf8");

test("Custom Workout log titles are blue and Apple Health titles stay warm white", () => {
  assert.match(source, /client-logs-session\$\{\/\^Custom Workout\\b\/i\.test\(displayTitle\)/);
  assert.match(source, /client-logs-session client-logs-health-session/);
  assert.match(logStyles, /client-logs-session\.is-custom-workout \.client-logs-session-copy strong[\s\S]*?color: #5aa9e8/);
  assert.match(logStyles, /client-logs-health-session \.client-logs-session-copy strong \{ color: #f7f3e9/);
});

function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const start = match.index;
  const next = source.slice(start + match[0].length).search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/);
  assert.ok(next >= 0, `${name} has a following declaration`);
  return source.slice(start, start + match[0].length + next);
}

test("selected exercise titles reopen the picker in trainer workouts without clearing sets", () => {
  const keyMarkup = functionSource("customWorkoutGroupedExerciseKeyMarkup");
  const logMarkup = functionSource("customWorkoutGroupedSectionsMarkup");
  assert.match(keyMarkup, /<button type="button" data-change-custom-exercise="\$\{index\}"/);
  assert.match(logMarkup, /<button class="ios-log-exercise-title" type="button" data-change-custom-exercise="\$\{exerciseIndex\}"/);

  const input = {
    value: "Leg Press",
    events: [],
    dispatchEvent(event) { this.events.push(event.type); }
  };
  const set = { weight: "180", reps: "10", classList: { contains: () => false } };
  const logElement = {};
  const carousel = {};
  const card = {};
  const block = { querySelector: () => null };
  let pickerSelect;
  let rendered = 0;
  const changeExercise = Function("deps", `
    const { input, set, logElement, carousel, card, block } = deps;
    const iosLogExerciseContext = () => ({ block, carousel, logElement, card });
    const customWorkoutEditableNameInput = () => input;
    const customWorkoutGroupedRows = () => [set];
    const workingSetType = "working";
    const openClientExerciseLibrary = (_input, onSelect) => { deps.setPickerSelect(onSelect); };
    const persistCustomWorkoutDraftForElement = () => {};
    const renderCustomWorkoutGroupedCard = () => { deps.rendered(); };
    const customWorkoutGroupedStatus = () => null;
    ${functionSource("handleIosLogExerciseAction")}
    return handleIosLogExerciseAction;
  `)({ input, set, logElement, carousel, card, block,
    setPickerSelect: (callback) => { pickerSelect = callback; },
    rendered: () => { rendered += 1; }
  });
  changeExercise({ dataset: { iosLogAction: "change" } });
  assert.equal(typeof pickerSelect, "function");
  pickerSelect("Hack Squat");
  assert.equal(input.value, "Hack Squat");
  assert.deepEqual(input.events, ["input", "change"]);
  assert.deepEqual([set.weight, set.reps], ["180", "10"]);
  assert.equal(rendered, 1);
});

test("all strength logger rows use a four-column Log box and only logged rows are saved", () => {
  const markup = functionSource("setRowMarkup");
  const fields = functionSource("exerciseLogFields");
  const grouped = functionSource("customWorkoutGroupedSetRowMarkup");
  const groupedSections = functionSource("customWorkoutGroupedSectionsMarkup");
  assert.match(markup, /data-complete-set aria-label="Log/);
  assert.doesNotMatch(markup, /data-set-rir|data-set-rest/);
  assert.match(fields, /<span>Set<\/span>[\s\S]*?<span>Weight<\/span>[\s\S]*?<span>Reps<\/span>[\s\S]*?<span>Log<\/span>/);
  assert.doesNotMatch(fields, /data-rir-help/);
  assert.match(grouped, /data-custom-grouped-set-toggle/);
  assert.doesNotMatch(grouped, /data-custom-grouped-field="rir"/);
  assert.doesNotMatch(groupedSections, /data-custom-grouped-(?:skip-warmup|log-warmup|log-round)/);
  assert.match(html, /client-workout-compact-log\.css/);

  const row = {
    dataset: {},
    classList: { contains: () => false },
    closest: () => null,
    querySelector(selector) { return { value: selector === "[data-set-weight]" ? "135" : "10" }; }
  };
  const check = Function("row", `
    const warmUpSetType = "warm_up";
    const setRowInputValues = (row) => ({ weightRaw: "135", repsRaw: "10", weightValue: 135, repsValue: 10 });
    ${functionSource("isSetRowLogged")}
    return isSetRowLogged(row);
  `);
  assert.equal(check(row), false);
  row.classList.contains = (name) => name === "is-complete";
  assert.equal(check(row), true);
});

test("logging a working set copies valid weight and reps into empty next-row fields", () => {
  const input = (value) => ({ value });
  const makeRow = (weight, reps, complete) => ({
    values: { weight: input(weight), reps: input(reps) },
    classList: { contains: () => complete },
    querySelector(selector) { return this.values[selector.match(/data-set-(weight|reps)/)[1]]; }
  });
  const first = makeRow("135", "10", true);
  const second = makeRow("", "", false);
  const third = makeRow("145", "", false);
  const rows = [first, second, third];
  const log = { querySelectorAll: () => rows };
  let drafts = 0;
  const prefill = Function("persist", `
    const warmUpSetType = "warm_up", workingSetType = "working";
    const setTypeForRow = () => workingSetType;
    const persistCustomWorkoutDraftForElement = persist;
    ${functionSource("customWorkoutGroupedCopyValue")}
    ${functionSource("prefillNextWorkingSet")}
    return prefillNextWorkingSet;
  `)(() => drafts++);
  assert.equal(prefill(log, first), 2);
  assert.deepEqual([second.values.weight.value, second.values.reps.value], ["135", "10"]);
  assert.equal(prefill(log, second), 1);
  assert.deepEqual([third.values.weight.value, third.values.reps.value], ["145", "10"]);
  assert.equal(drafts, 2);
});

test("grouped Log box saves its row, pre-fills the next round, and starts rest only after the full round", async () => {
  const states = [new Set(), new Set()];
  const canonical = states.map((state) => ({ classList: { contains: (name) => name === "is-complete" && state.has(name) }, dataset: {} }));
  const panel = { dataset: { customWorkoutTitle: "Custom Workout" }, querySelector: () => ({ value: "2026-10-29" }) };
  const section = { dataset: { customGroupedRound: "1" } };
  const visible = canonical.map((_, index) => ({ dataset: { customGroupedSetType: "working", customGroupedExerciseIndex: String(index), customGroupedSetNumber: "1" }, closest: () => section }));
  const carousel = { dataset: { customWorkoutFormat: "superset" }, closest: () => panel, querySelector: () => ({}), querySelectorAll: () => [] };
  const button = visible.map((row) => ({ disabled: false, closest: (selector) => selector === ".custom-workout-grouped-row" ? row : carousel }));
  const status = { textContent: "" };
  const calls = { saved: 0, copied: 0, rest: 0, started: 0 };
  const toggle = Function("deps", `
    const { canonical, carousel, panel, status, calls } = deps;
    const warmUpSetType = "warm_up", customWorkoutTitle = "Custom Workout";
    const workoutElapsedTimerState = null;
    const customWorkoutGroupedCanonicalRow = (_carousel, index) => canonical[Number(index)];
    const customWorkoutGroupedStatus = () => status;
    const setCustomWorkoutGroupedRowComplete = (row, complete) => complete ? deps.states[canonical.indexOf(row)].add("is-complete") : deps.states[canonical.indexOf(row)].delete("is-complete");
    const persistCustomWorkoutDraftForElement = () => {};
    const refreshCustomWorkoutGroupedCompletion = () => {};
    const requireWorkoutGymLocation = () => true;
    const customWorkoutGroupedTimerConflict = () => false;
    const validateCustomWorkoutGroupedExerciseNames = () => true;
    const validateCustomWorkoutGroupedSection = () => ({ valid: true });
    const customWorkoutGroupedLogElements = () => [{}, {}];
    const workoutGroupReadyForRest = (_format, count) => count >= 2;
    const saveTrainingLogRows = async () => { calls.saved++; return { saved: true }; };
    const autoCopyCustomWorkoutGroupedNextRound = () => { calls.copied++; };
    const startWorkoutElapsedTimer = () => { calls.started++; };
    const customWorkoutGroupedRoundIsLogged = () => deps.states.every((state) => state.has("is-complete"));
    const renderCustomWorkoutGroupedCard = () => {};
    const autoRestTimerEnabled = () => true;
    const workoutCarouselRestSeconds = () => 60;
    const setRestTimerDuration = () => {};
    const resetRestTimer = () => {};
    const startOrPauseRestTimer = () => { calls.rest++; };
    const renderCustomWorkoutGroupedRestControls = () => {};
    const todayDate = () => "2026-10-29";
    const document = { querySelectorAll: () => [panel] };
    ${functionSource("toggleCustomWorkoutGroupedSet")}
    return toggleCustomWorkoutGroupedSet;
  `)({ canonical, carousel, panel, status, calls, states });
  const first = await toggle(button[0]);
  assert.equal(first.saved, true);
  assert.equal(calls.rest, 0);
  const last = await toggle(button[1]);
  assert.equal(last.saved, true);
  assert.deepEqual(calls, { saved: 2, copied: 2, rest: 1, started: 2 });
  assert(canonical.every((row) => row.classList.contains("is-complete")));
  assert.equal(carousel.dataset.customGroupedRowSaving, undefined);
});
