const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("selects an exact previous session before falling back to date and title", () => {
  const source = sourceForFunction("clientWorkoutHistorySessionKey");
  const sessionKey = Function(`${source}; return clientWorkoutHistorySessionKey;`)();

  assert.equal(sessionKey({ workout_session_id: " Session-123 " }), "session:session-123");
  assert.equal(sessionKey({ session_id: "ABC", workout_session_id: "ignored" }), "session:abc");
  assert.equal(
    sessionKey({ entry_date: "2026-09-10", workout_title: " Lower Body " }),
    "legacy:2026-09-10::lower body"
  );
});

test("copies exercise and set structure without marking the new workout complete", () => {
  const copyableSource = sourceForFunction("isCopyableWorkoutHistoryLog");
  const draftSource = sourceForFunction("customWorkoutDraftFromLogs");
  const buildDraft = Function(
    "warmupExerciseCode",
    "cardioExerciseCode",
    "warmUpSetType",
    "workingSetType",
    "warmUpSetNumberBase",
    "customExerciseCode",
    "customWorkoutTitle",
    `${copyableSource}\n${draftSource}; return customWorkoutDraftFromLogs;`
  )(
    "WARMUP",
    "CARDIO",
    "warm_up",
    "working",
    1000,
    (index) => `CW${String(index + 1).padStart(2, "0")}`,
    "Custom workout"
  );
  const logs = [
    { workout_title: "Lower Body", entry_date: "2026-09-08", exercise_code: "WARMUP", exercise_name: "Bike", set_number: 1 },
    { workout_title: "Lower Body", entry_date: "2026-09-08", exercise_code: "A2", exercise_name: "Split Squat", set_number: 1, set_type: "working", weight_used: 0, reps: 10, effort_value: 2, notes: "Hard" },
    { workout_title: "Lower Body", entry_date: "2026-09-08", exercise_code: "A1", exercise_name: "Goblet Squat", set_number: 1001, set_type: "warm_up", weight_used: 20, reps: 8 },
    { workout_title: "Lower Body", entry_date: "2026-09-08", exercise_code: "A1", exercise_name: "Goblet Squat", set_number: 1, set_type: "working", weight_used: 40, reps: 10 },
    { workout_title: "Lower Body", entry_date: "2026-09-08", exercise_code: "A1", exercise_name: "Goblet Squat", set_number: 3, set_type: "working", weight_used: 50, reps: 8 },
    { workout_title: "Lower Body", entry_date: "2026-09-08", exercise_code: "CARDIO", exercise_name: "Walk", set_number: 1 }
  ];
  const draft = buildDraft(logs, {
    date: "2026-09-11",
    format: "superset",
    sessionKey: "session:lower-1",
    workoutTitle: "Custom workout · Lower Body · 10:11:12"
  });

  assert.equal(draft.date, "2026-09-11");
  assert.equal(draft.format, "superset");
  assert.equal(draft.workoutTitle, "Custom workout · Lower Body · 10:11:12");
  assert.equal(draft.copiedFrom.sessionKey, "session:lower-1");
  assert.deepEqual(draft.exercises.map((exercise) => exercise.code), ["CW01", "CW02"]);
  assert.deepEqual(draft.exercises.map((exercise) => exercise.name), ["Goblet Squat", "Split Squat"]);
  assert.deepEqual(
    draft.exercises[0].sets.map((set) => [set.label, set.setType]),
    [["W", "warm_up"], ["1", "working"], ["2", "working"], ["3", "working"]]
  );
  assert.deepEqual(
    draft.exercises.flatMap((exercise) => exercise.sets).map((set) => [set.weight, set.reps, set.rir]),
    draft.exercises.flatMap((exercise) => exercise.sets).map(() => ["", "", ""])
  );
  assert.ok(draft.exercises.every((exercise) => exercise.notes === "" && exercise.skipped === false));
});

test("keeps incomplete superset groups separate and keeps one circuit together", () => {
  const copyableSource = sourceForFunction("isCopyableWorkoutHistoryLog");
  const draftSource = sourceForFunction("customWorkoutDraftFromLogs");
  const buildDraft = Function(
    "warmupExerciseCode",
    "cardioExerciseCode",
    "warmUpSetType",
    "workingSetType",
    "warmUpSetNumberBase",
    "customExerciseCode",
    "customWorkoutTitle",
    `${copyableSource}\n${draftSource}; return customWorkoutDraftFromLogs;`
  )(
    "WARMUP",
    "CARDIO",
    "warm_up",
    "working",
    1000,
    (index) => `CW${String(index + 1).padStart(2, "0")}`,
    "Custom workout"
  );
  const logs = [
    { exercise_code: "A2", exercise_name: "Skipped-pair survivor", set_number: 1 },
    { exercise_code: "B1", exercise_name: "Row", set_number: 1 },
    { exercise_code: "B2", exercise_name: "Press", set_number: 1 }
  ];

  assert.deepEqual(
    buildDraft(logs, { format: "superset" }).exercises.map((exercise) => exercise.group),
    [0, 1, 1]
  );
  assert.deepEqual(
    buildDraft(logs, { format: "circuit" }).exercises.map((exercise) => exercise.group),
    [0, 0, 0]
  );
  assert.equal(
    buildDraft(Array.from({ length: 9 }, (_, index) => ({
      exercise_code: "A",
      exercise_name: "Calf Raise",
      set_number: index + 1
    })), { format: "single" }).exercises[0].sets.length,
    9
  );
});

test("infers older grouped formats and gives each copied session a unique storage title", () => {
  const formatSource = sourceForFunction("customWorkoutFormatForHistoryLogs");
  const inferFormat = Function(
    "currentProgram",
    "normalizeCustomWorkoutFormat",
    "inferWorkoutFormat",
    "customWorkoutTitle",
    `${formatSource}; return customWorkoutFormatForHistoryLogs;`
  )(
    { workouts: [] },
    (format) => format,
    (workout) => workout.format,
    "Custom workout"
  );
  const titleSource = sourceForFunction("copiedCustomWorkoutStorageTitle");
  const copyTitle = Function(
    "customWorkoutTitle",
    "truncateText",
    `${titleSource}; return copiedCustomWorkoutStorageTitle;`
  )("Custom workout", (value) => value);

  assert.equal(inferFormat([
    { workout_title: "Old plan", exercise_code: "A1" },
    { workout_title: "Old plan", exercise_code: "A2" }
  ]), "superset");
  assert.equal(inferFormat([{ workout_title: "Conditioning Circuit", exercise_code: "A" }]), "circuit");
  assert.equal(inferFormat([
    { workout_title: "Custom workout", exercise_code: "CW01" },
    { workout_title: "Custom workout", exercise_code: "CW02" }
  ]), "single");
  assert.notEqual(
    copyTitle([{ workout_title: "Lower Body" }], new Date(2026, 8, 11, 10, 11, 12)),
    copyTitle([{ workout_title: "Lower Body" }], new Date(2026, 8, 11, 10, 11, 13))
  );

  const panelSource = sourceForFunction("customWorkoutPanelMarkup");
  assert.match(panelSource, /warmupLogFields\(workoutStorageTitle/);
  assert.match(panelSource, /workoutStartControlMarkup\(workoutStorageTitle/);
  assert.match(panelSource, /customWorkoutCarouselMarkup\(format, workoutStorageTitle\)/);
  assert.match(panelSource, /cardioLogFields\(workoutStorageTitle/);
  assert.match(sourceForFunction("regroupCustomWorkoutCarousels"), /const hasExplicitGroups = cards\.some/);
});

test("protects a meaningful Custom Workout draft before replacement", () => {
  const source = sourceForFunction("customWorkoutDraftHasMeaningfulContent");
  const hasMeaningfulContent = Function(
    "normalizeCustomWorkoutFormat",
    `${source}; return customWorkoutDraftHasMeaningfulContent;`
  )((format) => ["single", "superset", "circuit"].includes(format) ? format : "single");

  assert.equal(hasMeaningfulContent(null, "2026-09-11"), false);
  assert.equal(hasMeaningfulContent({ format: "single", date: "2026-09-11", exercises: [{ name: "", sets: [{ weight: "", reps: "", rir: "" }] }] }, "2026-09-11"), false);
  assert.equal(hasMeaningfulContent({ format: "single", date: "2026-09-11", exercises: [{ name: "Deadlift", sets: [] }] }, "2026-09-11"), true);
  assert.equal(hasMeaningfulContent({ format: "circuit", date: "2026-09-11", exercises: [] }, "2026-09-11"), true);
});

test("protects entered Custom Workout warm-up and cardio fields", () => {
  const source = sourceForFunction("customWorkoutPanelHasAuxiliaryContent");
  const hasAuxiliaryContent = Function(`${source}; return customWorkoutPanelHasAuxiliaryContent;`)();
  const panel = (values) => ({
    querySelector: (selector) => ({ value: values[selector] || "" })
  });

  assert.equal(hasAuxiliaryContent(panel({
    "[data-warmup-type]": "Warm up",
    "[data-cardio-type]": "Cardio"
  })), false);
  assert.equal(hasAuxiliaryContent(panel({
    "[data-warmup-type]": "Warm up",
    "[data-cardio-type]": "Cardio",
    "[data-cardio-duration]": "20"
  })), true);
  assert.equal(hasAuxiliaryContent(panel({
    "[data-warmup-type]": "Mobility",
    "[data-cardio-type]": "Cardio"
  })), true);
});

test("renders an accessible per-workout copy action and never adds it to nutrition cards", () => {
  const historySource = sourceForFunction("renderClientTrainingLogs");
  const nutritionSource = sourceForFunction("nutritionLogHistorySections");

  assert.match(historySource, /data-copy-workout-to-custom/);
  assert.match(historySource, /Copy \$\{workout\.workout_title\} from \$\{formatLogDate\(workout\.entry_date\)\} to Custom workout/);
  assert.match(historySource, /workoutHistoryLogsForCopy\(workout\.history_key\)/);
  assert.doesNotMatch(nutritionSource, /data-copy-workout-to-custom/);
  assert.match(dashboard, /id="client-workout-copy-status" role="status" aria-live="polite"/);
  assert.match(portal, /data-custom-workout-copy-status role="status" aria-live="polite"/);
});

test("opens the copied draft in Custom Workout and restores focus visibly", () => {
  const handlerSource = sourceForFunction("handleCopyWorkoutToCustom");
  const previousWeightsSource = sourceForFunction("logsForExerciseDisplay");

  assert.match(handlerSource, /workoutHistoryLogsForCopy\(sessionKey\)/);
  assert.match(handlerSource, /if \(workoutElapsedTimerState\)/);
  assert.match(handlerSource, /window\.confirm\("Replace your current Custom Workout draft/);
  assert.match(handlerSource, /customWorkoutPanelHasAuxiliaryContent\(existingCustomPanel\)/);
  assert.match(handlerSource, /storeCustomWorkoutDraft\(draft\)/);
  assert.match(handlerSource, /replaceCustomWorkoutPanelFromDraft\(customPanelIndex\)/);
  assert.doesNotMatch(handlerSource, /renderClientWorkoutTabs/);
  assert.match(handlerSource, /setClientDashboardTab\("workouts"\)/);
  assert.match(handlerSource, /activateClientWorkoutPanel\(customPanelIndex/);
  assert.match(handlerSource, /heading\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(previousWeightsSource, /normalizeExerciseHistoryName\(log\.exercise_name\) === exerciseName/);
  assert.doesNotMatch(previousWeightsSource, /log\.workout_title === logElement\.dataset\.workoutTitle/);
  assert.match(portal, /const exactSessionLogs = logsForExercise\(logElement\.dataset\.workoutTitle, logElement\.dataset\.exerciseCode\);/);
  assert.match(portal, /const selectedLogs = exactSessionLogs\.filter\(\(log\) => log\.entry_date === selectedDate\);/);
  assert.match(portal, /handleCopyWorkoutToCustom\(\);/);
});

test("keeps the history action inside the mobile viewport", () => {
  assert.match(styles, /\.training-log-workout-heading\.has-copy-action \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*?\.training-log-workout-heading\.has-copy-action \{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(styles, /@media \(max-width: 600px\)[\s\S]*?\.dashboard-page \.training-log-copy-button \{[\s\S]*?width:\s*100% !important/);
});
