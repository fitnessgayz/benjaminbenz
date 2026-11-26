const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const compactStyles = fs.readFileSync(path.join(root, "css/client-logs-compact.css"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("calculates honest workout-card metrics from working strength sets", () => {
  const source = ["workoutHistorySummaryMetrics", "isWorkoutAnalysisTimedSet", "workoutAnalysisPositiveNumber",
    "workoutAnalysisStrengthSet"].map(sourceForFunction).join("\n");
  const summarize = Function(
    "warmupExerciseCode",
    "cardioExerciseCode",
    "warmUpSetType",
    "normalizedSetType",
    `${source}; return workoutHistorySummaryMetrics;`
  )(
    "WARMUP",
    "CARDIO",
    "warm_up",
    (type) => type || "working"
  );
  const workout = {
    supersets: new Map([
      ["WARMUP", { exercises: new Map([
        ["warmup", { exercise_code: "WARMUP", sets: [{ set_type: "working", weight_used: 20, reps: 10 }] }]
      ]) }],
      ["A", { exercises: new Map([
        ["press", {
          exercise_code: "A1",
          sets: [
            { set_type: "warm_up", weight_used: 50, reps: 5, effort_scale: "rir", effort_value: 4 },
            { set_type: "working", weight_used: 100, reps: 5, effort_scale: "rir", effort_value: 1 },
            { set_type: "working", weight_used: 110, reps: 4, effort_scale: "rir", effort_value: 2 },
            { set_type: "timed", weight_used: 10, reps: 30, duration_seconds: 30 }
          ]
        }]
      ]) }],
      ["CARDIO", { exercises: new Map([
        ["cardio", { exercise_code: "CARDIO", sets: [{ reps: 30 }] }]
      ]) }]
    ])
  };

  assert.deepEqual(summarize(workout), {
    exerciseCount: 3,
    workingSetCount: 2,
    totalReps: 9,
    volumeLabel: "940 lb"
  });
});

test("analyzes only the signed-in client's exact completed workout", () => {
  const source = ["clientWorkoutHistorySessionKey", "ownedWorkoutHistoryLogs",
    "workoutAnalysisPositiveNumber", "completedWorkoutAnalysisLogs"].map(sourceForFunction).join("\n");
  const logsForAnalysis = Function("activeDashboardUser", "activeClientEmail", "isCoachDashboardPreview",
    "normalizeClientEmail", `${source}; return completedWorkoutAnalysisLogs;`);
  const email = "client@example.invalid";
  const user = { id: "client", email };
  const sameDay = { entry_date: "2026-11-26", workout_title: "Strength", client_email: email };
  const completed = { ...sameDay, session_id: "finished", completed_at: "2026-11-26T19:00:00Z" };
  const draft = { ...sameDay, session_id: "draft" };
  const foreign = { ...completed, client_email: "other@example.invalid" };
  const legacyImport = { ...sameDay, workout_title: "Imported", source: "hevy" };
  const legacyFinish = { ...sameDay, id: "old", workout_duration_seconds: 1200 };
  const legacyNoCompletion = { ...sameDay, id: "older" };
  const normalize = value => String(value || "").trim().toLowerCase();
  const getRows = logsForAnalysis(user, email, false, normalize);
  assert.deepEqual(getRows("session:finished", [completed, draft, foreign]), [completed]);
  assert.deepEqual(getRows("session:draft", [completed, draft, foreign]), []);
  assert.deepEqual(getRows("legacy:2026-11-26::imported", [legacyImport]), [legacyImport]);
  assert.deepEqual(getRows("legacy:2026-11-26::strength", [legacyFinish]), [legacyFinish]);
  assert.deepEqual(getRows("legacy:2026-11-26::strength", [legacyNoCompletion]), []);
  assert.deepEqual(logsForAnalysis(user, email, true, normalize)("session:finished", [completed]), []);
});

test("separates strength, warm-ups, timed work and both saved cardio formats", () => {
  const source = ["isWorkoutAnalysisTimedSet", "workoutAnalysisPositiveNumber",
    "workoutAnalysisStrengthSet", "workoutAnalysisNumbers"].map(sourceForFunction).join("\n");
  const analyze = Function("warmupExerciseCode", "cardioExerciseCode", "warmUpSetType", "normalizedSetType",
    `${source}; return workoutAnalysisNumbers;`)("WARMUP", "CARDIO", "warmup", type => type);
  const running = { exercise_code: "CARDIO", exercise_name: "Run", exercise_order: 4,
    set_type: "timed", duration_seconds: 720, reps: 1.5, notes: "Calories: 80" };
  const rows = [
    running,
    { exercise_code: "WARMUP", exercise_name: "Mobility", weight_used: 50, reps: 10 },
    { exercise_code: "A2", exercise_name: "Plank", exercise_order: 2, set_type: "timed", duration_seconds: 45, reps: 45 },
    { exercise_code: "A1", exercise_name: "Bench Press", exercise_order: 1, weight_used: 100, reps: 5, workout_duration_seconds: 1800 },
    { exercise_code: "A1", exercise_name: "Bench Press", exercise_order: 1, set_type: "warmup", weight_used: 200, reps: 4 },
    { exercise_code: "A3", exercise_name: "Assisted Pull-Up", exercise_order: 3, weight_used: 70, reps: 8 },
    { exercise_code: "CARDIO", exercise_name: "Bike", exercise_order: 5, weight_used: 10, reps: 2 }
  ];
  const summary = analyze(rows);
  assert.equal(summary.durationSeconds, 1800);
  assert.equal(summary.volume, 500);
  assert.equal(summary.sets, 2);
  assert.equal(summary.reps, 13);
  assert.equal(summary.timedSeconds, 45);
  assert.equal(summary.cardioSeconds, 1320);
  assert.deepEqual(summary.exercises.map(exercise => exercise.name), ["Bench Press", "Plank", "Assisted Pull-Up", "Run", "Bike"]);
  assert.equal(summary.exercises[3].cardio[0].weight_used, 12);
  assert.equal(summary.exercises[3].cardio[0].reps, 1.5);
  assert.equal(running.weight_used, undefined, "analysis leaves saved records intact");
});

test("exercise search selects complete matching sessions so card totals and copy agree", () => {
  const sessionSource = sourceForFunction("clientWorkoutHistorySessionKey");
  const filterSource = sourceForFunction("filteredClientWorkoutHistoryLogs");
  const filterLogs = Function(
    "clientTrainingLogMatchesSearch",
    `${sessionSource}\n${filterSource}; return filteredClientWorkoutHistoryLogs;`
  )((log, query) => [log.workout_title, log.exercise_name, log.notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(String(query).toLowerCase()));
  const logs = [
    { session_id: "one", entry_date: "2026-09-12", workout_title: "Upper Body", exercise_name: "Bench Press" },
    { session_id: "one", entry_date: "2026-09-12", workout_title: "Upper Body", exercise_name: "Cable Curl" },
    { session_id: "two", entry_date: "2026-09-12", workout_title: "Lower Body", exercise_name: "Goblet Squat" },
    { session_id: "three", entry_date: "2026-09-11", workout_title: "Arms", exercise_name: "Cable Curl" }
  ];

  assert.deepEqual(
    filterLogs(logs, "2026-09-12", "curl").map((log) => log.exercise_name),
    ["Bench Press", "Cable Curl"]
  );
  assert.equal(filterLogs(logs, "2026-09-12", "").length, 3);
  assert.equal(filterLogs(logs, "2026-09-10", "curl").length, 0);
});

test("renders month-grouped workout and Health rows with expandable exercise details", () => {
  const renderSource = sourceForFunction("renderClientTrainingLogs");

  assert.match(renderSource, /client-logs-month-heading/);
  assert.match(renderSource, /client-logs-health-session/);
  assert.match(renderSource, /data-client-workout-history-card/);
  assert.match(renderSource, /data-client-workout-history-open/);
  assert.match(renderSource, /data-client-workout-history-details/);
  assert.match(renderSource, /training-log-superset-list/);
  assert.match(renderSource, /workout\.completed_at \? "Completed" : "Saved"/);
  assert.match(renderSource, /data-copy-workout-to-custom/);
  assert.match(renderSource, /data-client-exercise-history-open/);
  assert.doesNotMatch(renderSource, /Average RIR/);
  assert.match(renderSource, /renderClientLogsExerciseList\(\)/);
  assert.doesNotMatch(renderSource, /training-log-mobile-workout-browser/);
});

test("workout list rows open and close saved exercise details", () => {
  const expandSource = sourceForFunction("setClientWorkoutHistoryCardExpanded");
  const handlerSource = sourceForFunction("handleClientWorkoutHistoryDeck");

  assert.match(expandSource, /details\.hidden = !isExpanded/);
  assert.match(expandSource, /openButton\.setAttribute\("aria-expanded"/);
  assert.match(handlerSource, /data-client-workout-history-open/);
  assert.match(handlerSource, /data-client-workout-history-close/);
  assert.match(dashboard, /role="tablist" aria-label="Log sections"/);
});

test("renders food days as a separate mobile deck with expandable entries", () => {
  const nutritionSource = sourceForFunction("nutritionLogHistorySections");
  const renderSource = sourceForFunction("renderClientTrainingLogs");
  const syncSource = sourceForFunction("syncClientWorkoutHistoryDeck");
  const handlerSource = sourceForFunction("handleClientWorkoutHistoryDeck");

  assert.match(nutritionSource, /data-client-food-history-card/);
  assert.match(nutritionSource, /data-client-food-history-summary/);
  assert.match(nutritionSource, /data-client-food-history-open/);
  assert.match(nutritionSource, /data-client-food-history-details/);
  assert.match(nutritionSource, /View Foods/);
  assert.match(renderSource, /data-client-food-history-browser/);
  assert.match(renderSource, /data-client-food-history-deck/);
  assert.match(renderSource, /data-client-food-history-previous/);
  assert.match(renderSource, /data-client-food-history-next/);
  assert.match(renderSource, /syncClientFoodHistoryDeck\(activeFoodHistoryDeckIndex\)/);
  assert.match(syncSource, /historyType === "food"/);
  assert.match(syncSource, /activeFoodHistoryDeckIndex/);
  assert.match(handlerSource, /data-client-food-history-deck/);
  assert.match(handlerSource, /moveClientWorkoutHistoryDeck\(-1, historyType\)/);
  assert.match(handlerSource, /moveClientWorkoutHistoryDeck\(step, historyType\)/);
});

test("compact Logs styling keeps cards readable and actions tappable", () => {
  assert.match(compactStyles, /\.client-logs-tabs/);
  assert.match(compactStyles, /\.client-logs-session-open/);
  assert.match(compactStyles, /min-height:\s*84px/);
  assert.match(compactStyles, /--logs-blue:/);
  assert.match(compactStyles, /--logs-gold:/);
  assert.match(compactStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /\.training-log-history-card-details\[hidden\]/);
});

test("cache-busts the live dashboard assets after the Session Log release", () => {
  assert.match(dashboard, /css\/style\.css\?v=[^\"]*workout-preview-1/);
  assert.match(dashboard, /js\/client-portal\.js\?v=workout-preview-1/);
  assert.match(dashboard, /css\/client-logs-compact\.css\?v=1/);
  assert.match(portal, /handleClientWorkoutHistoryDeck\(\);/);
});
