const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const loggerHtml = fs.readFileSync(path.join(root, "coach-workout-log.html"), "utf8");
const loggerScript = fs.readFileSync(path.join(root, "js/coach-workout-log.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function coachLoggerRuntime() {
  const runtime = {
    console,
    document: { querySelector: () => null },
    window: { FWB_SUPABASE_CONFIG: {} },
  };

  vm.runInNewContext(loggerScript, runtime);
  return runtime;
}

function fakeClassList(initial = []) {
  const values = new Set(initial);

  return {
    contains: (name) => values.has(name),
    toggle(name, force) {
      if (force === undefined ? !values.has(name) : force) values.add(name);
      else values.delete(name);
    },
  };
}

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

test("renders supersets and circuits as full-width grouped cards instead of a swipe carousel", () => {
  const groupedMarkup = sourceForFunction("coachWorkoutGroupedCardMarkup");
  const layout = sourceForFunction("renderCoachWorkoutCardLayout");

  assert.match(loggerHtml, /data-coach-workout-group-stack/);
  assert.match(groupedMarkup, /data-coach-workout-grouped="true"/);
  assert.match(groupedMarkup, /class="coach-workout-grouped-card/);
  assert.match(layout, /format === "single"/);
  assert.match(layout, /coachWorkoutGroupedCardMarkup/);
  assert.doesNotMatch(loggerHtml, /data-coach-workout-previous|data-coach-workout-next|coach-workout-carousel-dots/);
  assert.doesNotMatch(styles, /\.coach-workout[^}]*scroll-snap-type:\s*x mandatory/);
  assert.match(
    styles,
    /\.coach-workout-grouped-card\s*\{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/,
  );
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

test("reopens a collapsed grouped name editor before focusing a validation error", () => {
  const rowMarkup = sourceForFunction("coachWorkoutGroupedNameRowMarkup");
  const focusVisible = sourceForFunction("focusCoachWorkoutVisibleField");

  assert.doesNotMatch(rowMarkup, /data-coach-grouped-name-input[^>]*required/);
  assert.match(focusVisible, /fields\?\.hidden/);
  assert.match(focusVisible, /fields\.hidden = false/);
  assert.match(focusVisible, /aria-expanded", "true"/);
  assert.match(focusVisible, /visible\.focus\(\)/);
});

test("repeats Set Weight Reps and RIR labels in warm-up and round sections", () => {
  const columns = sourceForFunction("coachWorkoutGroupedColumnLabelsMarkup");
  const sections = sourceForFunction("coachWorkoutGroupedSectionsMarkup");

  assert.match(columns, /<span[^>]*>Set<\/span>/);
  assert.match(columns, /<span[^>]*>Weight<\/span>/);
  assert.match(columns, /<span[^>]*>Reps<\/span>/);
  assert.match(columns, /<span[^>]*>RIR<\/span>/);
  assert.match(sections, /data-coach-grouped-section="warm-up"/);
  assert.match(sections, /data-coach-grouped-section="round"/);
  assert.match(sections, /Warm-up/);
  assert.match(sections, /Round \$\{roundNumber\}/);
  assert.ok(
    (sections.match(/coachWorkoutGroupedColumnLabelsMarkup\(\)/g) || []).length >= 2,
    "Column labels should render in the warm-up and every generated round",
  );
  assert.match(
    styles,
    /\.coach-workout-grouped-columns,[\s\S]*?\.coach-workout-grouped-row\s*\{[\s\S]*?grid-template-columns:\s*44px repeat\(3, minmax\(0, 1fr\)\)/,
  );
});

test("places a compact round stepper between the exercise key and sections", () => {
  const groupedMarkup = sourceForFunction("coachWorkoutGroupedCardMarkup");
  const keyIndex = groupedMarkup.indexOf("coach-workout-grouped-exercise-key");
  const stepperIndex = groupedMarkup.indexOf("coach-workout-grouped-round-stepper");
  const sectionsIndex = groupedMarkup.indexOf("data-coach-grouped-sections");
  const stepperMarkup = groupedMarkup.slice(stepperIndex, sectionsIndex);

  assert.ok(keyIndex >= 0, "Expected the grouped exercise key");
  assert.ok(stepperIndex > keyIndex, "Expected the round stepper after the exercise key");
  assert.ok(sectionsIndex > stepperIndex, "Expected grouped sections after the round stepper");
  assert.match(stepperMarkup, /role="group"[^>]*aria-label="Number of rounds"/);
  assert.match(stepperMarkup, /data-coach-grouped-delete-round/);
  assert.match(stepperMarkup, /aria-label="Remove last round"/);
  assert.match(stepperMarkup, />\s*(?:−|-)\s*<\/button>/);
  assert.match(stepperMarkup, /roundCount\s*<=?\s*1[^\n]*disabled/);
  assert.match(stepperMarkup, /<output[^>]*aria-live="polite"/);
  assert.match(stepperMarkup, /data-coach-grouped-round-count[^>]*>\$\{roundCount\}/);
  assert.match(stepperMarkup, /data-coach-grouped-add-round/);
  assert.match(stepperMarkup, /aria-label="Add round"/);
  assert.match(stepperMarkup, />\s*\+\s*<\/button>/);
  assert.doesNotMatch(groupedMarkup, /coach-workout-grouped-actions|>\s*\+ Add round\s*<|>\s*Delete round\s*</);
  assert.match(
    styles,
    /\.coach-workout-grouped-round-stepper\s*\{[^}]*grid-template-columns:\s*46px minmax\(0, 1fr\) 46px;[^}]*padding:\s*8px 12px;/,
  );
  assert.match(
    styles,
    /\.coach-workout-grouped-round-stepper :is\(button, output\)\s*\{[^}]*min-height:\s*44px;/,
  );
});

test("routes the grouped round stepper across every exercise", () => {
  const groupedMarkup = sourceForFunction("coachWorkoutGroupedCardMarkup");
  const addRound = sourceForFunction("addCoachWorkoutGroupedRound");
  const deleteRound = sourceForFunction("deleteCoachWorkoutGroupedRound");
  const interactions = sourceForFunction("handleCoachWorkoutForm");

  assert.match(groupedMarkup, /data-coach-grouped-add-round/);
  assert.match(groupedMarkup, /data-coach-grouped-delete-round/);
  assert.match(addRound, /data-coach-workout-set-rows/);
  assert.match(addRound, /coachWorkoutSetMarkup/);
  assert.match(addRound, /renderCoachWorkoutCardLayout\(\)/);
  assert.match(deleteRound, /coachWorkoutSetRowsByType/);
  assert.match(deleteRound, /renderCoachWorkoutCardLayout\(\)/);
  assert.match(interactions, /data-coach-grouped-add-round/);
  assert.match(interactions, /data-coach-grouped-delete-round/);
  assert.match(interactions, /scheduleCoachWorkoutAutosave/);
});

test("starts a fresh grouped session with three working rounds", () => {
  const runtime = coachLoggerRuntime();
  const resize = sourceForFunction("resizeUntouchedCoachWorkoutExercises");

  function setRow(setType) {
    const fields = {
      label: {
        value: setType === "warm_up" ? "W" : "",
        setAttribute() {},
      },
      weight: { value: "" },
      reps: { value: "" },
      rir: { value: "" },
    };

    return {
      classList: fakeClassList(setType === "warm_up" ? ["is-warm-up"] : []),
      dataset: {
        coachWorkoutSetNumber: setType === "warm_up" ? "1001" : "1",
        coachWorkoutSetType: setType,
      },
      querySelector(selector) {
        if (selector.includes("set-label")) return fields.label;
        if (selector.includes("weight")) return fields.weight;
        if (selector.includes("reps")) return fields.reps;
        if (selector.includes("rir")) return fields.rir;
        return null;
      },
    };
  }

  function freshExercise() {
    const rows = [setRow("warm_up")];
    const rowContainer = {
      get children() { return rows; },
      insertAdjacentHTML() { rows.push(setRow("working")); },
    };
    const progress = { textContent: "" };
    const deleteSet = { disabled: false };

    return {
      rows,
      querySelector(selector) {
        if (selector === "[data-coach-workout-set-rows]") return rowContainer;
        if (selector === "[data-coach-workout-progress]") return progress;
        if (selector === "[data-coach-workout-delete-set]") return deleteSet;
        return null;
      },
      querySelectorAll(selector) {
        return selector === "[data-coach-workout-set-row]" ? rows : [];
      },
    };
  }

  const exercises = [freshExercise(), freshExercise()];
  const normalizedRoundCount = runtime.normalizeCoachWorkoutGroupedRows(exercises);
  const groupedMarkupFactory = resize.match(
    /else\s*\{[\s\S]*?rows\.innerHTML\s*=\s*([A-Za-z_$][\w$]*)\(\)/,
  )?.[1];
  const freshGroupedMarkup = typeof runtime[groupedMarkupFactory] === "function"
    ? runtime[groupedMarkupFactory]()
    : "";
  const seededRoundCount = (
    freshGroupedMarkup.match(/data-coach-workout-set-type="working"/g) || []
  ).length;

  assert.ok(
    normalizedRoundCount === 3 || seededRoundCount === 3,
    "Fresh grouped workouts should seed or normalize to exactly three working rounds",
  );

  if (seededRoundCount === 3) {
    assert.match(resize, /list\.querySelectorAll\("\[data-coach-workout-exercise\]"\)\.forEach/);
  } else {
    exercises.forEach((exercise) => {
      assert.equal(
        exercise.rows.filter((row) => row.dataset.coachWorkoutSetType === "working").length,
        3,
      );
    });
  }
});

test("marks filled grouped rows complete and gives them a green state", () => {
  const { refreshCoachWorkoutGroupedProgress } = coachLoggerRuntime();
  const row = (weight, reps) => {
    const classList = fakeClassList();
    const fields = { weight: { value: weight }, reps: { value: reps } };

    return {
      classList,
      querySelector(selector) {
        return fields[selector.match(/="([^"]+)"/)?.[1]] || null;
      },
    };
  };
  const filled = row("100", "12");
  const partial = row("100", "");
  const progress = { textContent: "" };
  const card = {
    querySelector: () => progress,
    querySelectorAll: () => [filled, partial],
  };

  refreshCoachWorkoutGroupedProgress(card);

  assert.equal(filled.classList.contains("is-complete"), true);
  assert.equal(partial.classList.contains("is-complete"), false);
  assert.equal(progress.textContent, "1 / 2 complete");
  assert.match(
    styles,
    /\.coach-workout-grouped-row\.is-complete[^\{]*\{[^}]*background:\s*[^;}]*(?:lime|green|#[0-9a-f]{3,8})[^;}]*;/i,
  );
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
