const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const loggerHtml = fs.readFileSync(path.join(root, "coach-workout-log.html"), "utf8");
const loggerScript = fs.readFileSync(path.join(root, "js/coach-workout-log.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function sourceForFunction(name) {
  const plainStart = loggerScript.indexOf(`function ${name}(`);
  const asyncStart = loggerScript.indexOf(`async function ${name}(`);
  const start = plainStart >= 0 ? plainStart : asyncStart;

  assert.ok(start >= 0, `Expected ${name} to exist`);

  const signatureEnd = loggerScript.indexOf("\n", start);
  const bodyStart = loggerScript.lastIndexOf("{", signatureEnd);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let templateDepth = 0;

  for (let index = bodyStart; index < loggerScript.length; index += 1) {
    const character = loggerScript[index];
    const next = loggerScript[index + 1];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (quote === "`" && character === "$" && next === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }
      if (quote === "`" && character === "}" && templateDepth > 0) {
        templateDepth -= 1;
        continue;
      }
      if (character === quote && templateDepth === 0) quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return loggerScript.slice(start, index + 1);
    }
  }

  assert.fail(`Could not read ${name}`);
}

test("keeps Session logger as the first coach navigation link", () => {
  const navigationIndex = adminHtml.indexOf('id="coach-admin-sidebar-nav"');
  const clientsIndex = adminHtml.indexOf('data-admin-tab="clients"');
  const loggerIndex = adminHtml.indexOf('href="coach-workout-log.html"');
  const profileIndex = adminHtml.indexOf('data-admin-tab="profile"');

  assert.ok(navigationIndex >= 0);
  assert.ok(loggerIndex > navigationIndex);
  assert.ok(clientsIndex > loggerIndex);
  assert.ok(profileIndex > loggerIndex);
});

test("matches the custom workout card per-set controls and actions", () => {
  const exerciseMarkup = loggerScript.slice(
    loggerScript.indexOf("function coachWorkoutSetMarkup"),
    loggerScript.indexOf("function coachWorkoutExerciseElements")
  );
  const setIndex = exerciseMarkup.indexOf("data-coach-workout-set-row");
  const weightIndex = exerciseMarkup.indexOf("data-coach-workout-weight");
  const repsIndex = exerciseMarkup.indexOf("data-coach-workout-reps");
  const rirIndex = exerciseMarkup.indexOf("data-coach-workout-rir");

  assert.match(exerciseMarkup, /Input exercise name here/);
  assert.match(exerciseMarkup, /coach-workout-remove-exercise[\s\S]*?<svg/);
  assert.ok(setIndex >= 0 && weightIndex > setIndex && repsIndex > weightIndex && rirIndex > repsIndex);
  assert.match(exerciseMarkup, /data-coach-workout-add-set/);
  assert.match(exerciseMarkup, /data-coach-workout-delete-set/);
  assert.match(exerciseMarkup, /data-coach-workout-add-superset/);
  assert.match(exerciseMarkup, /data-coach-workout-notes-toggle/);
  assert.match(styles, /\.coach-workout-set-header,[\s\S]*?grid-template-columns:\s*54px minmax\(0, 1fr\) minmax\(0, 1fr\) 72px/);
});

test("renders straight sets supersets and circuits as full-width cards instead of a swipe carousel", () => {
  const groupedMarkup = sourceForFunction("coachWorkoutGroupedCardMarkup");
  const groups = sourceForFunction("coachWorkoutGroups");
  const layout = sourceForFunction("renderCoachWorkoutCardLayout");

  assert.match(loggerHtml, /data-coach-workout-group-stack/);
  assert.match(groupedMarkup, /data-coach-workout-grouped="true"/);
  assert.match(groupedMarkup, /class="coach-workout-grouped-card/);
  assert.match(groupedMarkup, /`Straight set \$\{groupIndex \+ 1\}`/);
  assert.match(groups, /if \(format === "single"\)/);
  assert.match(groups, /exercises\.map\(\(exercise, exerciseIndex\) => \[\{ exercise, exerciseIndex \}\]\)/);
  assert.match(layout, /\["single", "superset", "circuit"\]\.includes\(format\)/);
  assert.match(layout, /classList\.toggle\("is-grouped-source", usesWorkoutCards\)/);
  assert.match(layout, /stack\.hidden = !usesWorkoutCards/);
  assert.match(layout, /coachWorkoutGroupedCardMarkup/);
  assert.doesNotMatch(loggerHtml, /data-coach-workout-previous|data-coach-workout-next|coach-workout-carousel-dots/);
  assert.doesNotMatch(styles, /\.coach-workout[^}]*scroll-snap-type:\s*x mandatory/);
  assert.match(
    styles,
    /\.coach-workout-grouped-card\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/,
  );
});

test("builds one card per straight-set exercise while preserving grouped formats", () => {
  const groupsSource = sourceForFunction("coachWorkoutGroups");
  const groupsFor = Function(
    "coachWorkoutExerciseElements",
    `${groupsSource}; return coachWorkoutGroups;`,
  )(() => []);
  const exercises = [{ id: 1 }, { id: 2 }, { id: 3 }];

  assert.deepEqual(groupsFor("single", exercises), [
    [{ exercise: exercises[0], exerciseIndex: 0 }],
    [{ exercise: exercises[1], exerciseIndex: 1 }],
    [{ exercise: exercises[2], exerciseIndex: 2 }],
  ]);
  assert.deepEqual(groupsFor("superset", exercises).map((group) => group.length), [2, 1]);
  assert.deepEqual(groupsFor("circuit", exercises).map((group) => group.length), [3]);
});

test("uses a compact collapsible exercise-name editor for grouped workouts", () => {
  const editorMarkup = sourceForFunction("coachWorkoutGroupedNameEditorMarkup");
  const rowMarkup = sourceForFunction("coachWorkoutGroupedNameRowMarkup");
  const groupedMarkup = sourceForFunction("coachWorkoutGroupedCardMarkup");

  assert.match(editorMarkup, /data-coach-grouped-name-toggle/);
  assert.match(editorMarkup, /aria-expanded=/);
  assert.match(editorMarkup, /data-coach-grouped-name-fields/);
  assert.match(rowMarkup, /data-coach-grouped-name-input/);
  assert.match(groupedMarkup, /coachWorkoutGroupedNameEditorMarkup/);
  assert.match(loggerScript, /data-coach-grouped-name-toggle/);
  assert.match(loggerScript, /data-coach-grouped-name-input/);
});

test("shows the latest earlier exercise history at the bottom of every workout card", () => {
  const groupedMarkup = sourceForFunction("coachWorkoutGroupedCardMarkup");
  const historyMarkup = sourceForFunction("coachWorkoutGroupedHistoryMarkup");
  const exerciseHistoryMarkup = sourceForFunction("coachWorkoutPreviousExerciseMarkup");

  assert.ok(
    groupedMarkup.indexOf("coachWorkoutGroupedHistoryMarkup") > groupedMarkup.indexOf("coach-workout-grouped-notes"),
    "History should render below exercise notes",
  );
  assert.ok(
    groupedMarkup.indexOf("coachWorkoutGroupedHistoryMarkup") < groupedMarkup.indexOf("</article>"),
    "History should render at the bottom of the card",
  );
  assert.match(historyMarkup, /Previous workout/);
  assert.match(historyMarkup, /Latest earlier session/);
  assert.match(exerciseHistoryMarkup, /coachWorkoutPreviousHistory\.get/);
  assert.match(exerciseHistoryMarkup, /No earlier workout found/);
  assert.match(exerciseHistoryMarkup, /weight_used/);
  assert.match(exerciseHistoryMarkup, /row\.reps/);
  assert.match(exerciseHistoryMarkup, /effort_value/);
  assert.match(styles, /\.coach-workout-grouped-history\s*\{[\s\S]*?border-top:/);
});

test("selects the latest previous session for each normalized exercise name", () => {
  const historyBuilder = Function(`
    const coachWorkoutWarmUpSetNumberBase = 1000;
    const coachWorkoutWarmUpSetType = "warm_up";
    const coachWorkoutWorkingSetType = "working";
    ${sourceForFunction("coachWorkoutSetType")}
    ${sourceForFunction("normalizeCoachWorkoutHistoryName")}
    ${sourceForFunction("coachWorkoutHistorySessionKey")}
    ${sourceForFunction("coachWorkoutHistoryTimestamp")}
    ${sourceForFunction("buildCoachWorkoutPreviousHistory")}
    return buildCoachWorkoutPreviousHistory;
  `)();
  const history = historyBuilder([
    { entry_date: "2026-09-01", workout_title: "Upper", exercise_name: "Cable Chest Fly", set_number: 1, set_type: "working", weight_used: 15, reps: 12, created_at: "2026-09-01T10:00:00Z" },
    { entry_date: "2026-09-12", workout_title: "Chest", exercise_name: "  CABLE   CHEST FLY ", set_number: 1, set_type: "working", weight_used: 20, reps: 10, created_at: "2026-09-12T10:01:00Z" },
    { entry_date: "2026-09-12", workout_title: "Chest", exercise_name: "Cable Chest Fly", set_number: 1001, set_type: "warm_up", weight_used: 12.5, reps: 12, created_at: "2026-09-12T10:00:00Z" },
  ]);
  const cableFly = history.get("cable chest fly");

  assert.equal(cableFly.entryDate, "2026-09-12");
  assert.equal(cableFly.workoutTitle, "Chest");
  assert.deepEqual(cableFly.rows.map((row) => row.set_type), ["warm_up", "working"]);
  assert.deepEqual(cableFly.rows.map((row) => row.weight_used), [12.5, 20]);
});

test("loads client-scoped records through the active date and previous history strictly before it", () => {
  const loader = sourceForFunction("loadCoachWorkoutPreviousHistory");
  const contextSwitch = sourceForFunction("switchCoachWorkoutContext");
  const reset = sourceForFunction("resetCoachWorkoutForm");
  const boot = sourceForFunction("bootCoachWorkoutPage");

  assert.match(loader, /\.from\("client_workout_logs"\)/);
  assert.match(loader, /\.eq\("client_email", normalizedContext\.clientEmail\)/);
  assert.match(loader, /\.lte\("entry_date", normalizedContext\.entryDate\)/);
  assert.match(loader, /rows\.filter\(\(row\) => String\(row\.entry_date \|\| ""\) < normalizedContext\.entryDate\)/);
  assert.match(loader, /\.order\("entry_date", \{ ascending: false \}\)/);
  assert.match(loader, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(loader, /\.range\(offset, offset \+ pageSize - 1\)/);
  assert.match(loader, /requestId === coachWorkoutPreviousHistoryRequest/);
  assert.match(loader, /buildCoachWorkoutPreviousHistory/);
  assert.match(loader, /buildCoachWorkoutPersonalBests/);
  assert.match(contextSwitch, /loadCoachWorkoutPreviousHistory\(nextContext\)/);
  assert.match(reset, /loadCoachWorkoutPreviousHistory\(coachWorkoutActiveContext\)/);
  assert.match(boot, /loadCoachWorkoutPreviousHistory\(coachWorkoutActiveContext\)/);
});

test("reopens a collapsed grouped name editor before focusing a validation error", () => {
  const rowMarkup = sourceForFunction("coachWorkoutGroupedNameRowMarkup");
  const focusVisible = sourceForFunction("focusCoachWorkoutVisibleField");

  assert.doesNotMatch(rowMarkup, /data-coach-grouped-name-input[^>]*required/);
  assert.match(focusVisible, /fields\?\.hidden/);
  assert.match(focusVisible, /fields\.hidden = false/);
  assert.match(focusVisible, /aria-expanded", "true"/);
  assert.match(focusVisible, /visible\.focus\(\)/);
  assert.doesNotMatch(focusVisible, /coachWorkoutFormatValue\(\) === "single"/);
});

test("focuses the visible straight-set name editor after adding an exercise", () => {
  const interactions = sourceForFunction("handleCoachWorkoutForm");

  assert.match(interactions, /data-coach-grouped-name-input/);
  assert.match(interactions, /\|\| exercise\?\.querySelector\("\[data-coach-workout-name\]"\)/);
  assert.doesNotMatch(interactions, /coachWorkoutFormatValue\(\) === "single"/);
});

test("repeats Set Weight Reps and RIR labels in warm-up and round sections", () => {
  const columns = sourceForFunction("coachWorkoutGroupedColumnLabelsMarkup");
  const sections = sourceForFunction("coachWorkoutGroupedSectionsMarkup");

  assert.match(columns, /<span>Set<\/span>/);
  assert.match(columns, /<span>Weight<\/span>/);
  assert.match(columns, /<span>Reps<\/span>/);
  assert.match(columns, /<span>RIR<\/span>/);
  assert.match(sections, /data-coach-grouped-section="warm-up"/);
  assert.match(sections, /data-coach-grouped-section="round"/);
  assert.match(sections, /Warm-up/);
  assert.match(sections, /"Set" : "Round"\}\s*\$\{roundNumber\}/);
  assert.ok(
    (sections.match(/coachWorkoutGroupedColumnLabelsMarkup\(\)/g) || []).length >= 2,
    "Column labels should render in the warm-up and every generated round",
  );
});

test("adds and deletes a whole grouped round across every exercise", () => {
  const groupedMarkup = sourceForFunction("coachWorkoutGroupedCardMarkup");
  const addRound = sourceForFunction("addCoachWorkoutGroupedRound");
  const deleteRound = sourceForFunction("deleteCoachWorkoutGroupedRound");
  const interactions = sourceForFunction("handleCoachWorkoutForm");

  assert.match(groupedMarkup, /data-coach-grouped-add-round/);
  assert.match(groupedMarkup, /data-coach-grouped-delete-round/);
  assert.match(addRound, /data-coach-workout-set-rows/);
  assert.match(addRound, /coachWorkoutSetMarkup/);
  assert.match(deleteRound, /coachWorkoutSetRowsByType/);
  assert.match(interactions, /data-coach-grouped-add-round/);
  assert.match(interactions, /data-coach-grouped-delete-round/);
  assert.match(interactions, /scheduleCoachWorkoutAutosave/);
});

test("keeps grouped RIR within the same optional zero-to-four choices as saved sets", () => {
  const fieldMarkup = sourceForFunction("coachWorkoutGroupedFieldMarkup");
  const interactions = sourceForFunction("handleCoachWorkoutForm");

  assert.match(fieldMarkup, /if \(field === "rir"\)/);
  assert.match(fieldMarkup, /<select \$\{attributes\}>/);
  assert.match(fieldMarkup, /\[0, 1, 2, 3, 4\]/);
  assert.match(interactions, /data-coach-grouped-field="rir"/);
});

test("starts untouched straight superset and circuit sessions with 1 2 and 3 exercises", () => {
  const defaultsSource = sourceForFunction("coachWorkoutDefaultExerciseCount");
  const defaultCount = Function(`${defaultsSource}; return coachWorkoutDefaultExerciseCount;`)();
  const formatChange = sourceForFunction("handleCoachWorkoutForm");
  const resize = sourceForFunction("resizeUntouchedCoachWorkoutExercises");

  assert.equal(defaultCount("single"), 1);
  assert.equal(defaultCount("superset"), 2);
  assert.equal(defaultCount("circuit"), 3);
  assert.match(formatChange, /coachWorkoutDefaultExerciseCount/);
  assert.match(formatChange, /input\[name="coach_workout_format"\]/);
  assert.match(resize, /format === "single"/);
  assert.match(resize, /rows\.innerHTML = coachWorkoutSetMarkup\(\{\}, 0\)/);
});

test("keeps the coach autosave save and finish controls with the new card layout", () => {
  const save = sourceForFunction("saveCoachWorkout");

  assert.match(loggerHtml, /id="coach-workout-save"[^>]*>Save Workout<\/button>/);
  assert.match(loggerHtml, /id="coach-workout-finish"[^>]*>Finish Workout<\/button>/);
  assert.match(loggerHtml, /id="coach-workout-reset"[^>]*>Clear form<\/button>/);
  assert.match(loggerScript, /function scheduleCoachWorkoutAutosave/);
  assert.match(save, /client_workout_logs/);
  assert.match(save, /coachWorkoutExerciseValues/);
  assert.match(save, /coachWorkoutLastSavedSignature/);
});

test("locks zoom only on the coach session logger", () => {
  assert.match(
    loggerHtml,
    /name="viewport" content="width=device-width, initial-scale=1\.0, maximum-scale=1\.0, user-scalable=no"/,
  );
});

test("saves each set's weight reps and optional RIR", () => {
  assert.match(loggerScript, /data-coach-workout-set-label/);
  assert.match(loggerScript, /data-coach-workout-set-type=/);
  assert.match(loggerScript, /set_number:\s*set\.setNumber/);
  assert.match(loggerScript, /set_type:\s*set\.setType/);
  assert.match(loggerScript, /weight_used:\s*set\.weight/);
  assert.match(loggerScript, /reps:\s*set\.reps/);
  assert.match(loggerScript, /effort_scale:\s*set\.rir === null \? null : "rir"/);
  assert.match(loggerScript, /effort_value:\s*set\.rir/);
});

test("makes the warm-up set editable and accepts zero weight and reps", () => {
  assert.match(loggerScript, /placeholder="W" data-coach-workout-set-label/);
  assert.doesNotMatch(loggerScript, /data-coach-workout-set-label[^>]*readonly/);
  assert.match(loggerScript, /data-coach-workout-reps \/>/);
  assert.match(loggerScript, /reps < 0/);
  assert.doesNotMatch(loggerScript, /reps < 1/);
});

test("filters the exercise library into a scrollable name dropdown", () => {
  assert.match(loggerScript, /role="combobox"/);
  assert.match(loggerScript, /data-coach-workout-suggestions/);
  assert.match(loggerScript, /data-coach-workout-suggestion=/);
  assert.match(loggerScript, /\.filter\(\(item\) => item\.is_active !== false/);
  assert.match(loggerScript, /\.slice\(0, 16\)/);
  assert.match(styles, /\.coach-workout-suggestion-menu\s*\{[\s\S]*?max-height:\s*190px[\s\S]*?overflow-y:\s*auto/);
});
