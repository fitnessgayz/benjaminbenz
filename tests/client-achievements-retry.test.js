const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const portal = fs.readFileSync(require("node:path").join(__dirname, "../js/client-portal.js"), "utf8");
const retrySource = portal.slice(portal.indexOf("async function retryClientAchievements()"), portal.indexOf("\nfunction clientWorkoutAchievementCelebration"));

function fixture(logs = []) {
  let resolve;
  let reject;
  let historyRenders = 0;
  const draft = { weight: "135", reps: "8", date: "2026-09-26" };
  const context = vm.createContext({
    clientAchievementRetryInFlight: false, clientAchievementHistoryStatus: "error",
    activeClientEmail: "client@example.com", supabaseClient: {}, trainingLogs: logs,
    renderClientAchievements() {},
    renderClientTrainingLogs() { historyRenders++; },
    populateTrainingLogs() { draft.weight = ""; throw new Error("Must not rebuild workout editors"); },
    loadClientWorkoutLogHistory: () => new Promise((yes, no) => { resolve = yes; reject = no; })
  });
  vm.runInContext(retrySource, context);
  return { context, draft, complete: data => resolve({ data }), fail: () => reject(new Error("offline")), renders: () => historyRenders };
}

test("badge retry refreshes saved history without rebuilding an active workout", async () => {
  const f = fixture();
  const pending = f.context.retryClientAchievements();
  f.complete([{ id: "saved", weight_used: 100 }]);
  await pending;
  assert.equal(f.context.trainingLogs[0].id, "saved");
  assert.equal(f.context.clientAchievementHistoryStatus, "ready");
  assert.equal(f.renders(), 1);
  assert.deepEqual(f.draft, { weight: "135", reps: "8", date: "2026-09-26" });
});

for (const change of ["save", "delete", "edit"]) {
  test(`badge retry cannot overwrite a concurrent ${change}`, async () => {
    const f = fixture([{ id: "old", weight_used: 100 }]);
    const pending = f.context.retryClientAchievements();
    if (change === "save") f.context.trainingLogs.push({ id: "new", weight_used: 135 });
    if (change === "delete") f.context.trainingLogs.splice(0, 1);
    if (change === "edit") f.context.trainingLogs[0].weight_used = 135;
    const expected = JSON.stringify(f.context.trainingLogs);
    f.complete([{ id: "old", weight_used: 100 }]);
    await pending;
    assert.equal(JSON.stringify(f.context.trainingLogs), expected);
    assert.equal(f.context.clientAchievementHistoryStatus, "error");
    assert.equal(f.context.clientAchievementRetryInFlight, false);
    assert.equal(f.renders(), 0);
  });
}

test("an unexpected rejected request clears loading and permits a later retry", async () => {
  const f = fixture();
  const pending = f.context.retryClientAchievements();
  f.fail();
  await pending;
  assert.equal(f.context.clientAchievementHistoryStatus, "error");
  assert.equal(f.context.clientAchievementRetryInFlight, false);
  const retry = f.context.retryClientAchievements();
  f.complete([]);
  await retry;
  assert.equal(f.context.clientAchievementHistoryStatus, "ready");
});
