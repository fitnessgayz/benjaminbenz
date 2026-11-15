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

test("quick and custom workout logs retain their source after display title formatting", () => {
  const { isCustomWorkoutHistoryTitle: isCustom } = evaluate(["isCustomWorkoutHistoryTitle"]);
  assert.equal(isCustom(stored), true);
  assert.equal(isCustom("Custom workout"), true);
  assert.equal(isCustom(" Custom Workout · New · 09:25:00.123 "), true);
  assert.equal(isCustom("Full Body Workout"), false);
  assert.equal(isCustom("Custom Workout Challenge · Week 3"), false);
  assert.equal(isCustom("Lower Body"), false);
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

test("unnamed custom workouts get a readable name from distinct primary exercise muscles", () => {
  const context = evaluate(["automaticCustomWorkoutDisplayTitle"], {
    warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO",
    approvedExerciseForName: (name) => ({ primary_muscle: ({
      "Hip Thrust Machine": "glutes", "Leg Extension": "quads",
      "Seated Dumbbell Shoulder Press": "shoulders", "Dumbbell Lateral Raise": "shoulders",
      "Dumbbell Biceps Curl": "biceps", "Incline Dumbbell Press": "chest"
    })[name] }),
    normalizeMuscle: (value) => value || "",
    inferExerciseMuscles: () => []
  });
  const title = "Custom workout · New · 09:25:00.123";
  const row = (code, name) => Object.freeze({ workout_title: title, exercise_code: code, exercise_name: name });
  const glutes = row("A1", "Hip Thrust Machine");
  const shoulder = row("A1", "Seated Dumbbell Shoulder Press");
  const arms = row("A2", "Dumbbell Biceps Curl");
  assert.equal(context.automaticCustomWorkoutDisplayTitle(title, [glutes, glutes]), "Glutes Workout");
  assert.equal(context.automaticCustomWorkoutDisplayTitle(title, [shoulder, arms]), "Shoulders & Arms Workout");
  assert.equal(context.automaticCustomWorkoutDisplayTitle(title, [glutes, shoulder]), "Full Body Workout");
  assert.equal(context.automaticCustomWorkoutDisplayTitle(stored, [glutes]), "Full Body Workout");
  assert.equal(glutes.workout_title, title);
});

test("searching an automatic name returns every set in the workout", () => {
  const context = evaluate([
    "automaticCustomWorkoutDisplayTitle", "normalizeLogSearch", "logFieldsMatchSearch",
    "clientTrainingLogMatchesSearch", "clientWorkoutHistorySessionKey", "filteredClientWorkoutHistoryLogs"
  ], {
    warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO",
    approvedExerciseForName: (name) => ({ primary_muscle: name === "Leg Extension" ? "quads" : "glutes" }),
    normalizeMuscle: (value) => value || "", inferExerciseMuscles: () => []
  });
  const logs = [
    { session_id: "one", entry_date: "2026-09-25", workout_title: "Custom workout · New · 09:25:00.123", exercise_code: "A1", exercise_name: "Hip Thrust Machine", set_number: 1 },
    { session_id: "one", entry_date: "2026-09-25", workout_title: "Custom workout · New · 09:25:00.123", exercise_code: "A2", exercise_name: "Leg Extension", set_number: 1 },
    { session_id: "two", entry_date: "2026-09-25", workout_title: "Chest Day", exercise_code: "A1", exercise_name: "Bench Press", set_number: 1 }
  ];
  assert.equal(context.filteredClientWorkoutHistoryLogs(logs, "", "Lower Body Workout").length, 2);
  assert.equal(context.filteredClientWorkoutHistoryLogs(logs, "", "Chest Day").length, 1);
});

test("latest workout summary names only the latest session", () => {
  const title = "Custom workout · New · 09:25:00.123";
  const context = evaluate(["automaticCustomWorkoutDisplayTitle", "clientWorkoutHistorySessionKey", "latestWorkoutLogSummary"], {
    warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO",
    approvedExerciseForName: (name) => ({ primary_muscle: name === "Hip Thrust Machine" ? "glutes" : "chest" }),
    normalizeMuscle: (value) => value || "", inferExerciseMuscles: () => [],
    trainingLogs: [
      { session_id: "latest", entry_date: "2026-09-25", created_at: "2026-09-25T11:00:00Z", workout_title: title, exercise_code: "A1", exercise_name: "Hip Thrust Machine" },
      { session_id: "older", entry_date: "2026-09-25", created_at: "2026-09-25T10:00:00Z", workout_title: title, exercise_code: "A1", exercise_name: "Bench Press" }
    ]
  });
  assert.equal(context.latestWorkoutLogSummary().title, "Glutes Workout");
});

test("CSV export and copy status use readable names without mutating source records", () => {
  const row = Object.freeze({ workout_title: stored, entry_date: "2026-09-25", exercise_code: "A1", exercise_name: "Squat", set_number: 1, set_type: "working" });
  const context = evaluate(["automaticCustomWorkoutDisplayTitle", "clientWorkoutHistorySessionKey", "workoutHistoryCsv", "csvCell", "customWorkoutCopyStatusMessage"], {
    warmupExerciseCode: "WARMUP", cardioExerciseCode: "CARDIO", warmUpSetType: "warm_up",
    approvedExerciseForName: () => null, normalizeMuscle: () => "", inferExerciseMuscles: () => [],
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

test("log headings, accessible actions, confirmation and share summary use readable names", () => {
  const render = functionSource("renderClientTrainingLogs");
  assert.match(render, /const displayTitle = automaticCustomWorkoutDisplayTitle\(workout.workout_title, workout.logs\)/);
  assert.match(render, /<h3>\$\{escapeHtml\(\[displayTitle, workout\.gym_name\]\.filter\(Boolean\)\.join\(" · "\)\)\}<\/h3>/);
  assert.match(render, /Copy \$\{displayTitle\}/);
  assert.match(render, /Share \$\{displayTitle\}/);
  assert.match(functionSource("deleteClientWorkoutHistory"), /automaticCustomWorkoutDisplayTitle\(first.workout_title, target.rows\)/);
  const row = Object.freeze({ workout_title: stored, session_id: id, entry_date: "2026-09-25", exercise_code: "A1", exercise_name: "Squat" });
  const context = evaluate(["automaticCustomWorkoutDisplayTitle", "workoutCompletionShareSummary", "clientWorkoutHistorySessionKey", "workoutFeedbackSessionId"], {
    window: {}, warmupExerciseCode: "WARMUP", todayDate: () => "2026-09-25",
    cardioExerciseCode: "CARDIO", approvedExerciseForName: () => null,
    normalizeMuscle: () => "", inferExerciseMuscles: () => [],
    completedWorkoutCountForWeek: () => 1, workoutDifficultyLabel: () => "", workoutElapsedTimeLabel: () => ""
  });
  const summary = context.workoutCompletionShareSummary([row]);
  assert.equal(summary.title, "Full Body Workout");
  assert.equal(summary.historyKey, `session:${id}`);
  assert.equal(row.workout_title, stored);
});
