const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function functionSource(name) {
  const match = new RegExp(`function ${name}\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const remaining = source.slice(match.index + match[0].length);
  const end = remaining.search(/\n(?:async )?function \w+\(/);
  return source.slice(match.index, end < 0 ? undefined : match.index + match[0].length + end);
}

function fixture(options = {}) {
  let now = 100_000;
  let nextInterval = 2;
  const intervals = new Map([[1, "elapsed"], [2, "rest"]]);
  const storage = new Map();
  const classes = new Set(["rest-timer-open"]);
  const overlay = { hidden: false };
  const calls = { alerts: 0, focus: 0, elapsedRenders: 0, restRenders: 0 };
  const context = {
    Date: class extends Date { static now() { return now; } },
    window: {
      setInterval(callback, delay) { const id = ++nextInterval; intervals.set(id, { callback, delay }); return id; },
      clearInterval(id) { intervals.delete(id); },
      localStorage: {
        setItem(key, value) { if (options.storageThrows) throw new Error("Unavailable"); storage.set(key, value); },
        removeItem(key) { if (options.storageThrows) throw new Error("Unavailable"); storage.delete(key); }
      }
    },
    document: {
      querySelector: () => overlay,
      body: { classList: { remove: (value) => classes.delete(value) } }
    },
    navigator: { vibrate() { calls.alerts++; } },
    workoutElapsedTimerStorageKey: "timer",
    workoutElapsedTimerState: {
      workoutTitle: "Strength", workoutDate: "2026-09-22", clientEmail: "client@example.com",
      accumulatedMilliseconds: 10_000, startedAt: 80_000, running: true
    },
    workoutElapsedTimerIntervalId: 1,
    restTimerDurationSeconds: 60,
    restTimerRemainingSeconds: 60,
    restTimerEndsAt: 125_000,
    restTimerIntervalId: 2,
    restTimerRunSequence: 7,
    restTimerActiveRunId: 7,
    restTimerLastNotifiedRunId: 0,
    restTimerReturnFocus: { focus() { calls.focus++; } },
    customWorkoutGroupedRestAction: { isConnected: true },
    restTimerCompletionShouldNotify: () => true,
    showRestTimerCompleteNotification() { calls.alerts++; },
    renderWorkoutElapsedTimer() { calls.elapsedRenders++; },
    renderRestTimer() { calls.restRenders++; context.syncRestTimerRemaining(); },
    tickRestTimer() { context.syncRestTimerRemaining(); }
  };
  vm.createContext(context);
  vm.runInContext([
    "clearRestTimerInterval", "syncRestTimerRemaining", "resetRestTimer", "closeRestTimer",
    "clearWorkoutElapsedTimerInterval", "workoutElapsedMilliseconds", "workoutCompletionFields",
    "persistWorkoutElapsedTimerState", "runWorkoutElapsedTimer", "pauseWorkoutTimersForCompletion",
    "resumeWorkoutTimersAfterCancelledCompletion", "finishWorkoutElapsedTimer"
  ].map(functionSource).join("\n"), context);
  context.persistWorkoutElapsedTimerState();
  return { context, calls, intervals, storage, classes, overlay, advance: (milliseconds) => { now += milliseconds; } };
}

test("completion freezes elapsed and rest timers without counting feedback time or sending a rest alert", () => {
  const f = fixture();
  const snapshot = f.context.pauseWorkoutTimersForCompletion();
  assert.equal(snapshot.elapsedWasRunning, true);
  assert.equal(snapshot.restWasRunning, true);
  assert.equal(snapshot.restRemainingSeconds, 25);
  assert.equal(f.context.workoutElapsedMilliseconds(), 30_000);
  assert.equal(f.context.workoutElapsedTimerState.running, false);
  assert.equal(f.context.restTimerEndsAt, 0);
  assert.equal(f.context.restTimerActiveRunId, 0);
  assert.equal(f.intervals.size, 0);
  assert.equal(JSON.parse(f.storage.get("timer")).running, false);

  f.advance(180_000);
  assert.equal(f.context.workoutCompletionFields().workout_duration_seconds, 30);
  f.context.syncRestTimerRemaining();
  assert.equal(f.calls.alerts, 0);

  f.context.resumeWorkoutTimersAfterCancelledCompletion(snapshot);
  assert.equal(f.context.workoutElapsedTimerState.running, true);
  assert.equal(f.context.restTimerRemainingSeconds, 25);
  assert.equal(f.context.restTimerEndsAt, 305_000);
  assert.equal(f.intervals.size, 2);
  assert.equal(JSON.parse(f.storage.get("timer")).running, true);
  f.advance(5_000);
  assert.equal(f.context.workoutElapsedMilliseconds(), 35_000);
  const restRun = f.context.restTimerActiveRunId;
  f.context.resumeWorkoutTimersAfterCancelledCompletion(snapshot);
  assert.equal(f.context.restTimerActiveRunId, restRun, "Repeated cancellation does not restart timers");
  assert.equal(f.intervals.size, 2);
});

test("successful completion clears both timers, storage, inline rest, and overlay without stealing focus", () => {
  const f = fixture();
  const snapshot = f.context.pauseWorkoutTimersForCompletion();
  f.context.finishWorkoutElapsedTimer();
  assert.equal(f.context.workoutElapsedTimerState, null);
  assert.equal(f.context.workoutElapsedTimerIntervalId, null);
  assert.equal(f.context.restTimerEndsAt, 0);
  assert.equal(f.context.restTimerIntervalId, null);
  assert.equal(f.context.restTimerActiveRunId, 0);
  assert.equal(f.context.restTimerRemainingSeconds, 60);
  assert.equal(f.context.customWorkoutGroupedRestAction, null);
  assert.equal(f.context.restTimerReturnFocus, null);
  assert.equal(f.overlay.hidden, true);
  assert.equal(f.classes.has("rest-timer-open"), false);
  assert.equal(f.storage.has("timer"), false);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.calls.focus, 0);
  f.advance(100_000);
  f.context.resumeWorkoutTimersAfterCancelledCompletion(snapshot);
  f.context.syncRestTimerRemaining();
  assert.equal(f.intervals.size, 0, "Stale cancellation cannot restart a finished workout");
  assert.equal(f.calls.alerts, 0);
});

test("previously paused timers stay paused when workout completion is cancelled", () => {
  const f = fixture();
  f.context.workoutElapsedTimerState.running = false;
  f.context.workoutElapsedTimerState.startedAt = 0;
  f.context.restTimerEndsAt = 0;
  f.context.restTimerActiveRunId = 0;
  f.context.restTimerRemainingSeconds = 18;
  const snapshot = f.context.pauseWorkoutTimersForCompletion();
  f.advance(30_000);
  f.context.resumeWorkoutTimersAfterCancelledCompletion(snapshot);
  assert.equal(f.context.workoutElapsedTimerState.running, false);
  assert.equal(f.context.workoutElapsedMilliseconds(), 10_000);
  assert.equal(f.context.restTimerEndsAt, 0);
  assert.equal(f.context.restTimerRemainingSeconds, 18);
  assert.equal(f.intervals.size, 0);
});

test("already elapsed rest does not notify or restart while completing or cancelling", () => {
  const f = fixture();
  f.context.restTimerEndsAt = 99_000;
  const snapshot = f.context.pauseWorkoutTimersForCompletion();
  f.advance(30_000);
  f.context.resumeWorkoutTimersAfterCancelledCompletion(snapshot);
  assert.equal(f.context.restTimerEndsAt, 0);
  assert.equal(f.context.restTimerRemainingSeconds, 0);
  assert.equal(f.context.restTimerActiveRunId, 0);
  assert.equal(f.calls.alerts, 0);
  assert.equal(f.intervals.size, 1, "Only the workout elapsed timer resumes");
});

test("cancellation cannot replace a newer workout or a newer rest timer", () => {
  const f = fixture();
  const snapshot = f.context.pauseWorkoutTimersForCompletion();
  const newerState = { accumulatedMilliseconds: 5_000, startedAt: 0, running: false };
  f.context.workoutElapsedTimerState = newerState;
  f.context.customWorkoutGroupedRestAction = null;
  f.context.resumeWorkoutTimersAfterCancelledCompletion(snapshot);
  assert.equal(f.context.workoutElapsedTimerState, newerState);
  assert.equal(newerState.running, false);
  assert.equal(f.context.customWorkoutGroupedRestAction, null);
  assert.equal(f.context.restTimerEndsAt, 0);

  const next = f.context.pauseWorkoutTimersForCompletion();
  f.context.restTimerRunSequence += 1;
  f.context.restTimerEndsAt = 170_000;
  f.context.restTimerActiveRunId = f.context.restTimerRunSequence;
  f.context.resumeWorkoutTimersAfterCancelledCompletion(next);
  assert.equal(f.context.restTimerEndsAt, 170_000);
  assert.equal(f.context.restTimerActiveRunId, 8);
});

test("completion still clears active timers when browser storage is unavailable", () => {
  const f = fixture({ storageThrows: true });
  f.context.pauseWorkoutTimersForCompletion();
  f.context.finishWorkoutElapsedTimer();
  assert.equal(f.context.workoutElapsedTimerState, null);
  assert.equal(f.context.restTimerEndsAt, 0);
  assert.equal(f.context.restTimerActiveRunId, 0);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.overlay.hidden, true);
});
