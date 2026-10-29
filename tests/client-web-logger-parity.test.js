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

test("recent matched sets supply gray weight and rep hints, with prescription fallback", () => {
  const field = (fallback) => ({ value: "", placeholder: "", dataset: { defaultPlaceholder: fallback },
    setAttribute() {}, removeAttribute() {} });
  const row = (number, reps) => ({ dataset: { setNumber: String(number), setType: "working" },
    weight: field("0"), reps: field(reps),
    querySelector(selector) { return selector === "[data-set-weight]" ? this.weight : this.reps; } });
  const rows = [row(1, "8–12"), row(2, "8–12"), row(3, "8–12")];
  const log = { querySelector: () => ({ value: "2026-10-06" }), querySelectorAll: () => rows };
  const logs = [
    { entry_date: "2026-10-04", set_number: 1, weight_used: 100, reps: 4 },
    { entry_date: "2026-10-05", set_number: 1, weight_used: 50, reps: 10 },
    { entry_date: "2026-10-05", set_number: 2, weight_used: 55, reps: 9 }
  ];
  const api = Function("logs", "log", `
    const warmUpSetType = "warm_up", workingSetType = "working";
    const todayDate = () => "2026-10-06";
    const normalizedSetType = () => workingSetType;
    const setTypeForRow = () => workingSetType;
    const personalBestWeightLog = () => logs[0];
    const formatLogDate = (date) => date;
    const syncCustomWorkoutGroupedHistoryPlaceholders = () => {};
    ${["customWorkoutGroupedCopyValue", "latestPreviousSetLogs", "previousHistorySet", "historyPlaceholder", "updateSetHistoryPlaceholders"].map(functionSource).join("\n")}
    updateSetHistoryPlaceholders(log, logs);
    return log.querySelectorAll();
  `)(logs, log);
  assert.deepEqual(api.map((item) => [item.weight.placeholder, item.reps.placeholder]),
    [["50", "10"], ["55", "9"], ["55", "9"]]);
  assert.ok(api.every((item) => item.weight.value === "" && item.reps.value === ""));
  logs.length = 0;
  // A new exercise still shows the assigned/generated rep prescription.
  Function("logs", "log", `
    const warmUpSetType = "warm_up", workingSetType = "working";
    const todayDate = () => "2026-10-06";
    const normalizedSetType = () => workingSetType;
    const setTypeForRow = () => workingSetType;
    const personalBestWeightLog = () => null;
    const formatLogDate = (date) => date;
    const syncCustomWorkoutGroupedHistoryPlaceholders = () => {};
    ${["customWorkoutGroupedCopyValue", "latestPreviousSetLogs", "previousHistorySet", "historyPlaceholder", "updateSetHistoryPlaceholders"].map(functionSource).join("\n")}
    updateSetHistoryPlaceholders(log, logs);
  `)(logs, log);
  assert.equal(rows[0].reps.placeholder, "8–12");
  assert.equal(rows[0].weight.placeholder, "0");
});

test("logging a round copies valid weight and reps only into blank next-round fields", () => {
  const input = (value = "") => ({ value });
  const row = (completed, weight, reps) => ({ classList: { contains: () => completed },
    weight: input(weight), reps: input(reps),
    querySelector(selector) { return selector === "[data-set-weight]" ? this.weight : this.reps; } });
  const logs = [
    { rows: [row(true, "60", "10"), row(false, "", "8")] },
    { rows: [row(true, "0", "12"), row(false, "", "")] }
  ];
  let saved = 0;
  const copy = Function("logs", "save", `
    const workingSetType = "working";
    const customWorkoutGroupedLogElements = () => logs;
    const customWorkoutGroupedRows = (log) => log.rows;
    const persistCustomWorkoutDraftForElement = save;
    ${functionSource("customWorkoutGroupedCopyValue")}
    ${functionSource("autoCopyCustomWorkoutGroupedNextRound")}
    return autoCopyCustomWorkoutGroupedNextRound;
  `)(logs, () => saved++);
  assert.equal(copy({}, 1), 3);
  assert.deepEqual(logs.map((log) => [log.rows[1].weight.value, log.rows[1].reps.value]),
    [["60", "8"], ["0", "12"]]);
  assert.equal(saved, 1);
  assert.equal(copy({}, 1), 0);
});

test("saved workout rows no longer include RIR and history does not display it", () => {
  const saveRows = functionSource("rowsForTrainingLog");
  const history = functionSource("renderClientTrainingLogs");
  assert.doesNotMatch(saveRows, /effort_scale|effort_value|repsInReserve/);
  assert.doesNotMatch(history, /Average RIR/);
});
