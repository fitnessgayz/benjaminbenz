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
  const source = sourceForFunction("workoutHistorySummaryMetrics");
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
            { set_type: "working", weight_used: 110, reps: 4, effort_scale: "rir", effort_value: 2 }
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
    volumeLabel: "940 lb"
  });
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
