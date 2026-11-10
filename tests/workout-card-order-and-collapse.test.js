const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function declaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  const tail = source.slice(start);
  const next = tail.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? tail : tail.slice(0, next + 1);
}

test("saved custom workout order follows the draft instead of exercise codes", () => {
  const draft = [
    { code: "CW03", name: "Squat", group: 0 },
    { code: "CW01", name: "Press", group: 0 },
    { code: "CW02", name: "Row", group: 0 }
  ];
  const context = vm.createContext({
    activeCustomWorkoutFormat: "single",
    customWorkoutDraftExercises: () => draft,
    normalizeCustomWorkoutInlineGroupType: () => "single"
  });
  vm.runInContext(declaration("customWorkoutExercises"), context);
  assert.deepEqual(Array.from(context.customWorkoutExercises()).map((exercise) => exercise.code),
    ["CW03", "CW01", "CW02"]);
});

test("assigned workout order survives a rerender without changing exercise identities", () => {
  const exercises = [{ code: "A1" }, { code: "B1" }, { code: "C1" }];
  const context = vm.createContext({
    assignedWorkoutOrderKey: () => "saved-order",
    window: { localStorage: { getItem: () => '["C1","A1","B1"]' } }
  });
  vm.runInContext(declaration("orderedAssignedWorkoutExercises"), context);
  const ordered = Array.from(context.orderedAssignedWorkoutExercises(exercises, "Workout"));
  assert.deepEqual(ordered.map((exercise) => exercise.code), ["C1", "A1", "B1"]);
  assert.equal(ordered[1], exercises[0]);
});

test("moving a custom card preserves its live set fields and persists the new order", () => {
  const panel = { classList: { contains: (name) => name === "client-workout-panel-custom" },
    querySelector: () => ({ removeAttribute() {} }) };
  const stack = { children: [], insertBefore(item, before) {
    this.children.splice(this.children.indexOf(item), 1);
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, item);
  } };
  const card = (code, weight) => {
    const exercise = { dataset: { customWorkoutGroup: "0" }, code, weight };
    const carousel = { dataset: {}, parentNode: stack, exercise,
      closest: () => panel };
    Object.defineProperty(carousel, "nextSibling", { get: () => stack.children[stack.children.indexOf(carousel) + 1] || null });
    return carousel;
  };
  const first = card("A1", "115"), second = card("B1", "225");
  stack.children = [first, second];
  let saved = false;
  const context = vm.createContext({
    customWorkoutCarousels: () => stack.children,
    customWorkoutCarouselCards: (carousel) => [carousel.exercise],
    syncCustomWorkoutCarousel: () => {},
    persistCustomWorkoutDraftFromPanel: () => { saved = true; },
    syncWorkoutExerciseList: () => {}
  });
  vm.runInContext(declaration("reorderWorkoutCardGroup"), context);
  assert.equal(context.reorderWorkoutCardGroup(first, second, true), true);
  assert.deepEqual(stack.children, [second, first]);
  assert.equal(first.exercise.weight, "115");
  assert.equal(second.exercise.weight, "225");
  assert.equal(saved, true);
});

test("completed exercises minimize automatically and expand on request", () => {
  const state = new Set();
  const attrs = {};
  const progress = { textContent: "" };
  const button = { textContent: "", setAttribute: (name, value) => { attrs[name] = value; } };
  const carousel = { dataset: {} };
  const block = { classList: { toggle: (name, enabled) => enabled ? state.add(name) : state.delete(name) },
    closest: () => carousel,
    querySelector: (selector) => selector === "[data-ios-log-exercise-progress]" ? progress : button };
  const log = { dataset: {}, name: "Squat" };
  const rows = [{ classList: { contains: () => true } }, { classList: { contains: () => true } }];
  const context = vm.createContext({ currentExerciseLabel: (value) => value.name });
  vm.runInContext(declaration("syncGroupedExerciseCollapse"), context);
  carousel.dataset.customGroupedRowSaving = "true";
  context.syncGroupedExerciseCollapse(block, log, rows);
  assert.equal(state.has("is-exercise-collapsed"), false);
  delete carousel.dataset.customGroupedRowSaving;
  context.syncGroupedExerciseCollapse(block, log, rows);
  assert.equal(state.has("is-exercise-collapsed"), true);
  assert.equal(attrs["aria-expanded"], "false");
  assert.equal(progress.textContent, "2 / 2 complete");
  log.dataset.exerciseManuallyExpanded = "true";
  context.syncGroupedExerciseCollapse(block, log, rows);
  assert.equal(state.has("is-exercise-collapsed"), false);
  assert.equal(attrs["aria-expanded"], "true");
});
