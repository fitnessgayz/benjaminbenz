const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const id = "e5b179d1-d9b9-4347-9bf9-7cdbb1e5c7b5";
const stored = `Custom workout · Full body workout · ${id}`;

function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, name);
  const next = source.slice(match.index + match[0].length).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/);
  return source.slice(match.index, match.index + match[0].length + next);
}
function evaluate(names, context = {}) {
  vm.createContext(context);
  vm.runInContext(["workoutDisplayTitle", ...names].map(functionSource).join("\n"), context);
  return context;
}

test("generated workout names show their readable title and keep abbreviations", () => {
  const { workoutDisplayTitle: title } = evaluate([]);
  assert.equal(title(stored), "Full Body Workout");
  assert.equal(title(` CUSTOM WORKOUT · full body workout · ${id.toUpperCase()} `), "Full Body Workout");
  assert.equal(title("Custom workout · HIIT and TRX strength"), "HIIT And TRX Strength");
  assert.equal(title("Custom workout · iOS mobility"), "iOS Mobility");
  assert.equal(title("Lower Body"), "Lower Body");
  assert.equal(title(""), "Workout");
  assert.equal(title(`Custom workout · ${id}`), "Custom Workout");
});

test("only a full trailing UUID is stripped; meaningful names and non-UUID suffixes remain", () => {
  const { workoutDisplayTitle: title } = evaluate([]);
  assert.equal(title("Custom workout · Phase 2 · 12345678"), "Phase 2 · 12345678");
  assert.equal(title("Custom workout · Tempo · 10:11:12.345"), "Tempo · 10:11:12.345");
  assert.equal(title("Custom workout challenge · Week 3"), "Custom Workout Challenge · Week 3");
  assert.equal(title(`Strength · ${id} · Week 3`), `Strength · ${id.charAt(0).toUpperCase() + id.slice(1)} · Week 3`);
});

test("readable display never changes grouping or stored workout identity", () => {
  const context = evaluate(["clientWorkoutHistorySessionKey"]);
  const saved = Object.freeze({ workout_title: stored, entry_date: "2026-09-25", session_id: id });
  assert.equal(context.workoutDisplayTitle(saved.workout_title), "Full Body Workout");
  assert.equal(context.clientWorkoutHistorySessionKey(saved), `session:${id}`);
  assert.equal(context.clientWorkoutHistorySessionKey({ ...saved, session_id: null }), `legacy:2026-09-25::${stored.toLowerCase()}`);
  assert.equal(saved.workout_title, stored);
});

test("search finds the readable name while preserving raw-name lookup", () => {
  const context = evaluate(["normalizeLogSearch", "logFieldsMatchSearch", "clientTrainingLogMatchesSearch"]);
  const row = { workout_title: stored };
  assert.equal(context.clientTrainingLogMatchesSearch(row, "Full Body Workout"), true);
  assert.equal(context.clientTrainingLogMatchesSearch(row, "custom workout"), true);
  assert.equal(context.clientTrainingLogMatchesSearch(row, id), true);
});

test("CSV export and copy status use readable names without mutating source records", () => {
  const row = Object.freeze({ workout_title: stored, entry_date: "2026-09-25", exercise_code: "A1", exercise_name: "Squat", set_number: 1, set_type: "working" });
  const context = evaluate(["workoutHistoryCsv", "csvCell", "customWorkoutCopyStatusMessage"], {
    warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO", warmUpSetType: "warm_up",
    sortedTrainingLogsForExport: (rows) => rows, csvSectionForLog: () => "Superset A",
    setNumberLabel: String, normalizedSetType: (value) => value, workoutDifficultyForLog: () => null,
    formatLogDate: String
  });
  const csv = context.workoutHistoryCsv([row]);
  assert.match(csv, /2026-09-25,Full Body Workout,/);
  assert.ok(!csv.includes(id));
  assert.match(context.customWorkoutCopyStatusMessage({ copiedFrom: { workoutTitle: stored, entryDate: "2026-09-25" } }), /^Copied Full Body Workout from/);
  assert.equal(row.workout_title, stored);
});

test("log headings, accessible actions, confirmation and share summary use the formatter", () => {
  const render = functionSource("renderClientTrainingLogs");
  assert.match(render, /const displayTitle = workoutDisplayTitle\(workout.workout_title\)/);
  assert.match(render, /<h3>\$\{escapeHtml\(displayTitle\)\}/);
  assert.match(render, /Copy \$\{displayTitle\}/);
  assert.match(render, /Share \$\{displayTitle\}/);
  assert.match(functionSource("deleteClientWorkoutHistory"), /workoutDisplayTitle\(first.workout_title\)/);
  const row = Object.freeze({ workout_title: stored, session_id: id, entry_date: "2026-09-25", exercise_code: "A1", exercise_name: "Squat" });
  const context = evaluate(["workoutCompletionShareSummary", "clientWorkoutHistorySessionKey", "workoutFeedbackSessionId"], {
    window: {}, warmupExerciseCode: "WARMUP", todayDate: () => "2026-09-25",
    completedWorkoutCountForWeek: () => 1, workoutDifficultyLabel: () => "", workoutElapsedTimeLabel: () => ""
  });
  const summary = context.workoutCompletionShareSummary([row]);
  assert.equal(summary.title, "Full Body Workout");
  assert.equal(summary.historyKey, `session:${id}`);
  assert.equal(row.workout_title, stored);
});
