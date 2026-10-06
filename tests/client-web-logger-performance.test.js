const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? undefined : start + 1 + next);
}

test("grouped history renders coalesce while working out and flush before Logs is shown", () => {
  let renderCount = 0;
  let idle;
  let cancelled = 0;
  const window = {
    requestIdleCallback(callback) { idle = callback; return 1; },
    cancelIdleCallback() { cancelled++; }
  };
  const controller = Function("window", "onRender", `
    let activeClientDashboardTab = "workouts";
    let clientTrainingLogsRenderPending = false;
    let clientTrainingLogsRenderHandle = null;
    let clientTrainingLogsRenderHandleKind = "";
    function renderClientTrainingLogs() { cancelScheduledClientTrainingLogsRender(); onRender(); }
    ${["cancelScheduledClientTrainingLogsRender", "scheduleClientTrainingLogsRender", "flushScheduledClientTrainingLogsRender"].map(functionSource).join("\n")}
    return {
      schedule: scheduleClientTrainingLogsRender,
      flush: flushScheduledClientTrainingLogsRender,
      tab: (value) => { activeClientDashboardTab = value; },
      pending: () => clientTrainingLogsRenderPending
    };
  `)(window, () => renderCount++);
  controller.schedule();
  controller.schedule();
  assert.equal(renderCount, 0);
  assert.equal(controller.pending(), true);
  controller.tab("logs");
  controller.flush();
  assert.equal(renderCount, 1);
  assert.equal(controller.pending(), false);
  assert.equal(cancelled, 1);
  idle(); // A stale callback cannot rebuild the history twice.
  assert.equal(renderCount, 1);
  controller.schedule(); // Saves on the visible Logs tab update immediately.
  assert.equal(renderCount, 2);
});

test("rest timer checks each tick but only paints when the second or running state changes", () => {
  let syncs = 0;
  let paints = 0;
  const onSync = () => { syncs++; };
  onSync.calls = () => syncs;
  const timer = Function("onSync", "onPaint", `
    let restTimerRemainingSeconds = 60;
    let restTimerEndsAt = 1000;
    function syncRestTimerRemaining() {
      onSync();
      if (onSync.calls() === 4) restTimerRemainingSeconds = 59;
      if (onSync.calls() === 8) restTimerEndsAt = 0;
    }
    function renderRestTimer() { onPaint(); }
    ${functionSource("tickRestTimer")}
    return tickRestTimer;
  `)(onSync, () => paints++);
  for (let index = 0; index < 8; index++) timer();
  assert.equal(syncs, 8);
  assert.equal(paints, 2);
});

test("grouped sets defer history rendering, while finish remains immediate", () => {
  const groupedRound = functionSource("logCustomWorkoutGroupedRound");
  const groupedWarmUp = functionSource("logCustomWorkoutGroupedWarmUp");
  const autosave = functionSource("scheduleTrainingLogAutosave");
  const save = functionSource("saveTrainingLogRows");
  assert.match(groupedRound, /deferHistoryRender: true/);
  assert.match(groupedWarmUp, /deferHistoryRender: true/);
  assert.match(autosave, /deferHistoryRender: true/);
  assert.match(save, /if \(options\.deferHistoryRender\) scheduleClientTrainingLogsRender\(\);\s*else renderClientTrainingLogs\(\);/);
  assert.match(source, /groupedSaveOptions\s*=\s*groupedCustomWorkout\s*\?\s*\{ skipRemovedSetDelete: true, skipLogRefresh: true \}/);
});
