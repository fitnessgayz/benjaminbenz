const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const WorkoutLayout = require("../js/workout-layout.js");
const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const tail = source.slice(start), end = tail.slice(1).search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end + 1);
}
function context(values = {}) {
  const scope = vm.createContext({ WorkoutLayout, warmUpSetType: "warm_up", setTypeForRow: row => row.type,
    exerciseNameInputForLog: log => log.input,
    escapeHtml: value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
    ...values });
  vm.runInContext(["workoutExerciseListLogs", "workoutExerciseListDetail", "syncWorkoutExerciseList", "jumpToWorkoutExercise"].map(declaration).join("\n"), scope);
  return scope;
}
function log({ name = "Row", code = "CW01", reps = ["8", "8", "8"], assigned = false, prescription = "", warmup = "20" } = {}) {
  const working = reps.map(value => ({ type: "working", reps: { value, placeholder: "99", dataset: { defaultPlaceholder: "10" } } }));
  const rows = [{ type: "warm_up", reps: { value: warmup } }, ...working];
  rows.forEach(row => { row.querySelector = selector => selector === "[data-set-reps]" ? row.reps : null; });
  return { dataset: { exerciseName: name, exerciseCode: code, exercisePrescription: prescription },
    input: { value: name }, rows, working,
    querySelectorAll: selector => selector === "[data-set-row]" ? rows : [],
    closest: selector => selector === ".client-workout-panel-assigned" && assigned ? {} : null };
}

test("exercise list preserves canonical panel order and excludes warm-up/cardio blocks", () => {
  const a = log({ name: "Row", code: "CW02" }), b = log({ name: "Row", code: "CW01" }), blank = log({ name: "", code: "CW03" });
  const panel = { querySelectorAll: () => [{ dataset: { warmupLog: "" } }, a, { dataset: { cardioLog: "" } }, b, blank] };
  assert.deepEqual(Array.from(context().workoutExerciseListLogs(panel)), [a, b, blank]);
  assert.deepEqual(Array.from(context().workoutExerciseListLogs(null)), []);
});

test("metadata uses actual working sets and entered reps, including uniform zero and ranges", () => {
  const api = context();
  for (const [reps, expected] of [
    [["8", "8", "8"], "3 sets · 8 reps"], [["12", "8", "10"], "3 sets · 8–12 reps"],
    [["0"], "1 set · 0 reps"], [[], "0 sets"]
  ]) assert.equal(api.workoutExerciseListDetail(log({ reps, warmup: "999" })), expected);
});

test("blank, partial or invalid custom reps never borrow history placeholders", () => {
  const api = context();
  for (const reps of [["", "", ""], ["8", "", "8"], ["-1", "8"], ["1.5"], ["invalid"]]) {
    assert.equal(api.workoutExerciseListDetail(log({ reps, prescription: "3 x 99" })), `${reps.length} set${reps.length === 1 ? "" : "s"}`);
  }
});

test("assigned blank reps use their prescription while partial entered reps remain incomplete", () => {
  const api = context();
  assert.equal(api.workoutExerciseListDetail(log({ reps: ["", ""], assigned: true, prescription: "3 x 8-12" })), "2 sets · 8-12 reps");
  assert.equal(api.workoutExerciseListDetail(log({ reps: [""], assigned: true, prescription: "3 x 30 sec" })), "1 set · 30 sec");
  assert.equal(api.workoutExerciseListDetail(log({ reps: ["8", ""], assigned: true, prescription: "3 x 12" })), "2 sets");
  assert.equal(api.workoutExerciseListDetail(log({ reps: [""], assigned: true })), "1 set");
});

function listFixture(logs) {
  let html = "", writes = 0;
  const list = { dataset: {}, hidden: false, contains: () => false, querySelector: () => null,
    get innerHTML() { return html; }, set innerHTML(value) { html = value; writes++; } };
  const empty = { hidden: true };
  const section = { querySelector: selector => selector === "[data-workout-exercise-list-items]" ? list : empty };
  const panel = { querySelector: () => section, querySelectorAll: () => logs };
  const document = { activeElement: {} };
  return { list, panel, empty, document, api: context({ document }), get writes() { return writes; } };
}

test("rendered list numbers duplicate/blank names independently and escapes user names", () => {
  const h = listFixture([log({ code: "CW01" }), log({ code: "CW02" }), log({ code: "CW03", name: "" }), log({ code: "CW04", name: '<img src="x">' })]);
  h.api.syncWorkoutExerciseList(h.panel);
  assert.match(h.list.innerHTML, /data-workout-exercise-jump="0"/);
  assert.match(h.list.innerHTML, /data-workout-exercise-jump="1"/);
  assert.match(h.list.innerHTML, /Go to Exercise 3: Exercise 3/);
  assert.match(h.list.innerHTML, /&lt;img src=&quot;x&quot;>/);
  assert.doesNotMatch(h.list.innerHTML, /<img /);
  assert.equal(h.empty.hidden, true);
  assert.equal(h.list.hidden, false);
});

test("name and rep updates retain existing list buttons and focused workout inputs", () => {
  const exercise = log(), h = listFixture([exercise]);
  h.api.syncWorkoutExerciseList(h.panel);
  const name = { textContent: "Row" }, detail = { textContent: "3 sets · 8 reps" }, attrs = {};
  const button = { querySelector: selector => selector === "[data-workout-exercise-list-name]" ? name : detail,
    setAttribute: (key, value) => { attrs[key] = value; } };
  h.list.querySelector = () => button;
  const activeInput = { value: "17.5" }; h.document.activeElement = activeInput;
  exercise.input.value = "Edited Row"; exercise.working[1].reps.value = "12";
  h.api.syncWorkoutExerciseList(h.panel);
  assert.equal(h.writes, 1); assert.equal(h.list.querySelector(), button);
  assert.equal(name.textContent, "Edited Row"); assert.equal(detail.textContent, "3 sets · 8–12 reps");
  assert.equal(attrs["aria-label"], "Go to Exercise 1: Edited Row");
  assert.equal(h.document.activeElement, activeInput); assert.equal(activeInput.value, "17.5");
});

test("addition, deletion and ordering update indices; an empty workout exposes its empty state", () => {
  const logs = [log({ code: "CW01" }), log({ code: "CW03" })], h = listFixture(logs);
  h.api.syncWorkoutExerciseList(h.panel);
  logs.splice(1, 0, log({ code: "CW02", name: "Press" })); h.api.syncWorkoutExerciseList(h.panel);
  assert.match(h.list.innerHTML, /Go to Exercise 2: Press/);
  logs.splice(0, 1); h.api.syncWorkoutExerciseList(h.panel);
  assert.match(h.list.innerHTML, /Go to Exercise 1: Press/);
  logs.length = 0; h.api.syncWorkoutExerciseList(h.panel);
  assert.equal(h.empty.hidden, false); assert.equal(h.list.hidden, true); assert.equal(h.list.innerHTML, "");
});

test("jump targets the indexed visible exercise within the clicked panel without rebuilding inputs", () => {
  const focused = [], scrolled = [], expanded = [];
  const target = index => ({ index, attrs: {}, classList: { add() {}, remove() {} },
    setAttribute(key, value) { this.attrs[key] = value; }, focus(options) { focused.push([this, options]); },
    scrollIntoView(options) { scrolled.push([this, options]); } });
  const targets = [target(0), target(1)], staleHighlight = target(9);
  let cleared = 0; staleHighlight.classList.remove = () => { cleared++; };
  const carousel = { dataset: { customWorkoutGrouped: "true" }, querySelector: () => ({ children: targets }) };
  const cards = [target(0), target(1)]; cards.forEach(card => { card.closest = () => carousel; });
  const logs = [log({ code: "CW01" }), log({ code: "CW02" })];
  logs.forEach((entry, index) => { entry.closest = () => cards[index]; });
  const panel = { querySelectorAll: selector => selector === "[data-exercise-log]" ? logs : [staleHighlight] };
  const button = { dataset: { workoutExerciseJump: "1" }, closest: () => panel };
  const api = context({ customWorkoutGroupedLogElements: () => logs, setWorkoutExerciseCardExpanded: (card, value) => expanded.push([card, value]),
    moveCustomWorkoutCarousel: () => assert.fail("Grouped navigation must not move or rerender a legacy deck") });
  const repsBefore = logs.map(entry => entry.working.map(row => row.reps.value));
  api.jumpToWorkoutExercise(button);
  assert.equal(focused[0][0], targets[1]); assert.equal(focused[0][1].preventScroll, true);
  assert.equal(scrolled[0][0], targets[1]); assert.equal(scrolled[0][1].block, "start");
  assert.equal(targets[1].attrs.tabindex, "-1"); assert.equal(cleared, 1);
  assert.deepEqual(expanded, [[cards[1], true]]);
  assert.deepEqual(logs.map(entry => entry.working.map(row => row.reps.value)), repsBefore);
  for (const index of ["-1", "invalid", "1.5", "9"]) { button.dataset.workoutExerciseJump = index; api.jumpToWorkoutExercise(button); }
  assert.equal(focused.length, 1, "Missing or invalid targets are harmless");
});
