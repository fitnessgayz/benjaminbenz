const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}

function session({ running = true, dismissed = false, confirm = true, storageThrows = false } = {}) {
  const events = [];
  const state = { workoutTitle: "Wrong program", running, dismissed, accumulatedMilliseconds: 1000 };
  const storage = new Map([["timer", JSON.stringify(state)], ["saved-sets", "keep"]]);
  const picker = { innerHTML: "old choices" };
  const context = vm.createContext({
    workoutElapsedTimerState: state,
    workoutElapsedTimerStorageKey: "timer",
    workoutElapsedTimerIntervalId: running ? 42 : null,
    customWorkoutGroupedRestAction: {},
    clientPreviewProgramSelected: true,
    currentProgram: { workouts: [] },
    document: { getElementById: () => picker },
    window: {
      confirm: message => { events.push(["confirm", message]); return confirm; },
      clearInterval: id => events.push(["clearInterval", id]),
      localStorage: { removeItem: key => {
        if (storageThrows) throw new Error("Storage unavailable");
        storage.delete(key);
      } }
    },
    closeRestTimer: () => events.push(["closeRest"]),
    resetRestTimer: () => events.push(["resetRest"]),
    renderWorkoutElapsedTimer: () => events.push(["render"]),
    clientWorkoutPickerItems: workouts => workouts,
    clientWorkoutListMarkup: () => "program choices",
    setClientDashboardTab: tab => events.push(["tab", tab]),
    showClientWorkoutPicker: () => events.push(["picker"])
  });
  vm.runInContext([
    "clearWorkoutElapsedTimerInterval", "finishWorkoutElapsedTimer", "cancelActiveWorkout"
  ].map(functionSource).join("\n"), context);
  return { context, events, state, storage, picker };
}

test("Home and Workouts both expose cancellation through the click handler", () => {
  assert.equal((dashboard.match(/data-cancel-active-workout/g) || []).length, 2);
  const handler = functionSource("handleWorkoutInteractions");
  assert.match(handler, /event.target.closest\("\[data-cancel-active-workout\]"\)/);
  assert.match(handler, /if \(cancelActiveWorkoutButton\) \{\s*cancelActiveWorkout\(\);\s*return;/);
});

for (const [label, options] of [
  ["running", {}], ["paused", { running: false }], ["hidden timer", { dismissed: true }]
]) {
  test(`cancels a ${label} workout, clears persistence, and opens program choices`, () => {
    const { context, events, storage, picker } = session(options);
    context.cancelActiveWorkout();
    assert.equal(context.workoutElapsedTimerState, null);
    assert.equal(context.workoutElapsedTimerIntervalId, null);
    assert.equal(context.customWorkoutGroupedRestAction, null);
    assert.equal(context.clientPreviewProgramSelected, false);
    assert.equal(storage.has("timer"), false);
    assert.equal(storage.get("saved-sets"), "keep");
    assert.equal(picker.innerHTML, "program choices");
    assert.match(events[0][1], /Wrong program/);
    assert.deepEqual(events.slice(-3), [["render"], ["tab", "workouts"], ["picker"]]);
    assert.ok(events.some(([event]) => event === "resetRest"));
    // The harness has no saving/completion APIs: cancellation must not call them.
  });
}

test("declining cancellation preserves the session and current view", () => {
  const { context, events, state, storage, picker } = session({ confirm: false });
  context.cancelActiveWorkout();
  assert.equal(context.workoutElapsedTimerState, state);
  assert.equal(context.workoutElapsedTimerIntervalId, 42);
  assert.equal(storage.has("timer"), true);
  assert.equal(picker.innerHTML, "old choices");
  assert.equal(events.length, 1);
});

test("cancellation without an active workout does nothing", () => {
  const { context, events } = session();
  context.workoutElapsedTimerState = null;
  context.cancelActiveWorkout();
  assert.deepEqual(events, []);
});

test("unavailable storage still lets the client choose another workout", () => {
  const { context, events } = session({ storageThrows: true });
  context.cancelActiveWorkout();
  assert.equal(context.workoutElapsedTimerState, null);
  assert.deepEqual(events.at(-1), ["picker"]);
});
