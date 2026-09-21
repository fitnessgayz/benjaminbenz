const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");

function sourceForFunction(name) {
  const plainStart = portal.indexOf(`function ${name}(`);
  const asyncStart = portal.indexOf(`async function ${name}(`);
  const start = plainStart >= 0 ? plainStart : asyncStart;

  assert.ok(start >= 0, `Expected ${name} to exist`);

  const signatureEnd = portal.indexOf("\n", start);
  const bodyStart = portal.lastIndexOf("{", signatureEnd);
  let depth = 0;
  let quote = "";
  let escaped = false;
  let templateDepth = 0;

  for (let index = bodyStart; index < portal.length; index += 1) {
    const character = portal[index];
    const next = portal[index + 1];

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
      if (depth === 0) return portal.slice(start, index + 1);
    }
  }

  assert.fail(`Could not read ${name}`);
}

test("renders grouped custom workouts as one full-width card instead of a swipe deck", () => {
  const groupedMarkup = sourceForFunction("customWorkoutGroupedRoundCardMarkup");
  const groupBranch = sourceForFunction("customWorkoutCarouselGroupMarkup");

  assert.match(groupedMarkup, /data-custom-workout-grouped="true"/);
  assert.equal((groupedMarkup.match(/class="custom-workout-grouped-card"/g) || []).length, 1);
  assert.match(groupedMarkup, /data-custom-workout-grouped-source hidden aria-hidden="true"/);
  assert.doesNotMatch(groupedMarkup, /data-custom-workout-exercise-deck|data-workout-group-next-card/);
  assert.match(
    groupBranch,
    /return customWorkoutGroupedRoundCardMarkup\(/,
  );
  assert.match(
    mobileStyles,
    /\[data-custom-workout-grouped="true"\] \.custom-workout-grouped-card \{[\s\S]*?width: 100%;[\s\S]*?max-width: 100%;[\s\S]*?min-width: 0;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    mobileStyles,
    /\[data-custom-workout-grouped="true"\] \.custom-workout-grouped-source \{[\s\S]*?display: none !important;/,
  );
});

test("uses a compact collapsible EXERCISES editor with per-exercise delete controls", () => {
  const editorMarkup = sourceForFunction("customWorkoutGroupNameEditorMarkup");
  const rowMarkup = sourceForFunction("customWorkoutGroupNameRowMarkup");

  assert.match(editorMarkup, /<strong>Exercises<\/strong>/);
  assert.doesNotMatch(editorMarkup, /<strong>Exercise names<\/strong>/i);
  assert.match(editorMarkup, /data-custom-workout-group-name-toggle/);
  assert.match(editorMarkup, /data-custom-workout-group-name-fields/);
  assert.match(rowMarkup, /data-custom-workout-group-delete="\$\{index\}"/);
  assert.match(rowMarkup, /aria-label="Delete \$\{escapeHtml\(position\)\}"/);
  assert.match(
    mobileStyles,
    /\[data-custom-workout-grouped="true"\] \.custom-workout-group-name-toggle i \{[\s\S]*?width: 44px;[\s\S]*?height: 44px;/,
  );
});

test("renders the exercise key, compact round stepper, round rows, and grouped actions", () => {
  const groupedMarkup = sourceForFunction("customWorkoutGroupedRoundCardMarkup");
  const exerciseKey = sourceForFunction("customWorkoutGroupedExerciseKeyMarkup");
  const sections = sourceForFunction("customWorkoutGroupedSectionsMarkup");
  const rowMarkup = sourceForFunction("customWorkoutGroupedSetRowMarkup");

  assert.match(exerciseKey, /custom-workout-grouped-exercise-number/);
  assert.match(exerciseKey, /data-custom-grouped-exercise-name/);
  assert.match(sections, /<h4>Warm-up<\/h4>/);
  assert.match(sections, /Excluded from working volume/);
  assert.match(sections, /<h4>\$\{workoutSetUnit\(carousel\)\} \$\{roundNumber\}<\/h4>/);
  assert.match(sections, /const columnLabelsMarkup = `[\s\S]*?<span>Weight<\/span><span>Reps<\/span><span>RIR<\/span>/);
  assert.equal(
    (sections.match(/\$\{columnLabelsMarkup\}/g) || []).length,
    2,
    "Column labels should render in the warm-up and every generated round",
  );
  assert.doesNotMatch(groupedMarkup, /custom-workout-grouped-columns/);
  assert.match(sections, /data-custom-grouped-log-round="\$\{roundNumber\}"/);
  assert.match(sections, /logged \? `✓ \$\{workoutSetUnit\(carousel\)\}/);
  assert.match(sections, /data-custom-grouped-rest-adjust="-15"/);
  assert.match(sections, /data-custom-grouped-rest-toggle/);
  assert.match(sections, /data-custom-grouped-rest-adjust="15"/);
  assert.match(rowMarkup, /data-custom-grouped-set-toggle/);
  assert.match(groupedMarkup, /data-custom-grouped-remove-round/);
  assert.match(groupedMarkup, /data-custom-grouped-round-count/);
  assert.match(groupedMarkup, /data-custom-grouped-add-round/);
  assert.match(groupedMarkup, /data-custom-grouped-finish-workout>Finish workout<\/button>/);
  assert.match(
    mobileStyles,
    /\.custom-workout-grouped-exercise-key-item \{[\s\S]*?font-style: italic;[\s\S]*?font-weight: 950;[\s\S]*?text-transform: uppercase;/,
  );
});

test("accepts skipped warm-ups and optional RIR while validating working reps", () => {
  const fieldMarkup = sourceForFunction("customWorkoutGroupedFieldMarkup");
  const validate = sourceForFunction("validateCustomWorkoutGroupedSection");
  const validateSection = Function(
    "customWorkoutGroupedStatus",
    "warmUpSetType",
    `${validate}; return validateCustomWorkoutGroupedSection;`,
  )(() => null, "warm_up");
  const input = (value) => ({
    value,
    invalid: false,
    setAttribute(name) { if (name === "aria-invalid") this.invalid = true; },
    removeAttribute(name) { if (name === "aria-invalid") this.invalid = false; },
    focus() {},
  });
  const row = (setType, weight, reps, rir) => {
    const fields = { weight: input(weight), reps: input(reps), rir: input(rir) };
    return {
      dataset: { customGroupedSetType: setType },
      fields,
      querySelector(selector) {
        return fields[selector.match(/="([^"]+)"/)?.[1]] || null;
      },
    };
  };
  const section = (rows) => ({
    querySelectorAll: () => rows,
    closest: () => null,
  });

  assert.match(fieldMarkup, /min="0"/);
  assert.match(fieldMarkup, /field === "rir" \? ' max="5"'/);
  assert.match(validate, /data-custom-grouped-field/);
  assert.match(validate, /aria-invalid/);
  assert.match(validate, /weight/);
  assert.match(validate, /reps/);
  assert.match(validate, /rir/);
  assert.match(validate, /< 0/);
  assert.match(validate, /<= 0/);
  assert.match(validate, /> 5/);
  assert.match(validate, /rirRaw !== ""/);
  assert.doesNotMatch(validate, /field === "weight"[^\n]*<= 0/);

  const skippedWarmUp = row("warm_up", "0", "0", "");
  assert.equal(validateSection(section([skippedWarmUp]), { focus: false }).valid, true);
  assert.equal(skippedWarmUp.fields.rir.invalid, false);

  const workingSet = row("working", "0", "1", "");
  assert.equal(validateSection(section([workingSet]), { focus: false }).valid, true);

  const zeroRepWorkingSet = row("working", "0", "0", "");
  assert.equal(validateSection(section([zeroRepWorkingSet]), { focus: false }).valid, false);
  assert.equal(zeroRepWorkingSet.fields.reps.invalid, true);

  const invalidRir = row("working", "0", "1", "6");
  assert.equal(validateSection(section([invalidRir]), { focus: false }).valid, false);
  assert.equal(invalidRir.fields.rir.invalid, true);
});

test("starts the persistent workout timer and rest timer after a successful round log", () => {
  const logRound = sourceForFunction("logCustomWorkoutGroupedRound");
  const readTimer = sourceForFunction("readWorkoutElapsedTimerState");
  const startTimer = sourceForFunction("startWorkoutElapsedTimer");
  const renderTimer = sourceForFunction("renderWorkoutElapsedTimer");

  assert.match(logRound, /validateCustomWorkoutGroupedSection/);
  assert.match(logRound, /saveTrainingLogRows/);
  assert.match(logRound, /if \(!workoutElapsedTimerState\)/);
  assert.match(logRound, /startWorkoutElapsedTimer\([\s\S]*?startedAfterRound: roundNumber/);
  assert.match(logRound, /customWorkoutGroupedRestAction/);
  assert.match(logRound, /resetRestTimer\(\)/);
  assert.match(logRound, /startOrPauseRestTimer\(\)/);
  assert.match(readTimer, /startedAfterRound/);
  assert.match(startTimer, /context\.startedAfterRound/);
  assert.match(renderTimer, /renderCustomWorkoutGroupedTimerPanels\(\)/);
});

test("routes grouped controls through explicit round, add, finish, and edit handlers", () => {
  const interactions = sourceForFunction("handleWorkoutInteractions");
  const addRound = sourceForFunction("addCustomWorkoutGroupedRound");
  const removeRound = sourceForFunction("removeCustomWorkoutGroupedRound");
  const adjustRest = sourceForFunction("adjustRestTimer");
  const finishPrompt = sourceForFunction("ensureCustomWorkoutGroupedFinishPanel");

  assert.match(interactions, /data-custom-grouped-log-round/);
  assert.match(interactions, /data-custom-grouped-add-round/);
  assert.match(interactions, /data-custom-grouped-remove-round/);
  assert.match(interactions, /data-custom-grouped-rest-adjust/);
  assert.match(interactions, /data-custom-grouped-rest-toggle/);
  assert.match(interactions, /data-custom-grouped-finish-workout/);
  assert.match(interactions, /data-custom-grouped-set-toggle/);
  assert.match(interactions, /data-custom-grouped-field/);
  assert.match(addRound, /addSetRow/);
  assert.match(addRound, /renderCustomWorkoutGroupedCard/);
  assert.match(removeRound, /roundCount <= 1/);
  assert.match(removeRound, /customWorkoutGroupedRoundIsLogged/);
  assert.match(removeRound, /window\.confirm/);
  assert.match(removeRound, /row\.remove\(\)/);
  assert.match(adjustRest, /restTimerRemainingSeconds \+ adjustment/);
  assert.match(adjustRest, /Date\.now\(\) \+ restTimerRemainingSeconds \* 1000/);
  assert.match(finishPrompt, /Start new workout/i);
  assert.match(finishPrompt, /Workout done/i);
});

test("saves only explicitly completed grouped rows without deleting future rounds", () => {
  const isLogged = sourceForFunction("isSetRowLogged");
  const logRound = sourceForFunction("logCustomWorkoutGroupedRound");
  const saveRows = sourceForFunction("saveTrainingLogRows");

  assert.match(isLogged, /closest\("\[data-custom-workout-grouped-source\]"\)/);
  assert.match(isLogged, /!setRow\.classList\.contains\("is-complete"\)/);
  assert.match(logRound, /skipRemovedSetDelete: true/);
  assert.match(logRound, /skipLogRefresh: true/);
  assert.match(saveRows, /options\.skipRemovedSetDelete/);
  assert.match(saveRows, /options\.skipLogRefresh/);
});

test("starts a fresh custom session with a unique storage title after completion", () => {
  const defaultCount = sourceForFunction("customWorkoutDefaultExerciseCount");
  const restartConfig = sourceForFunction("groupedCustomWorkoutRestartConfig");
  const freshTitle = sourceForFunction("freshCustomWorkoutStorageTitle");
  const restart = sourceForFunction("startFreshGroupedCustomWorkout");
  const finishSave = sourceForFunction("handleTrainingLogSave");
  const storedDrafts = [];
  const panel = {
    dataset: { customWorkoutFormat: "superset" },
    querySelector(selector) {
      return selector === "[data-workout-date]" ? { value: "2026-09-17" } : null;
    }
  };
  const restartApi = Function(
    "normalizeCustomWorkoutFormat",
    "activeCustomWorkoutFormat",
    "todayDate",
    "document",
    "customWorkoutDefaultWorkingSetCount",
    "warmUpSetType",
    "workingSetType",
    "storeCustomWorkoutFormat",
    "storeCustomWorkoutDraft",
    "freshCustomWorkoutStorageTitle",
    "customExerciseCode",
    "replaceCustomWorkoutPanelFromDraft",
    "activateClientWorkoutPanel",
    `${defaultCount}; ${restartConfig}; ${restart}; return { groupedCustomWorkoutRestartConfig, startFreshGroupedCustomWorkout };`
  )(
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    "single",
    () => "2026-09-17",
    { querySelectorAll: () => [panel] },
    2,
    "warm_up",
    "working",
    () => {},
    (draft) => storedDrafts.push(draft),
    () => `Custom workout · New · ${storedDrafts.length}`,
    (index) => `CW${String(index + 1).padStart(2, "0")}`,
    () => ({}),
    () => {}
  );

  assert.match(freshTitle, /Custom workout|customWorkoutTitle/);
  assert.match(freshTitle, /getMilliseconds/);
  assert.match(restart, /storeCustomWorkoutDraft/);
  assert.match(restart, /workoutTitle: freshCustomWorkoutStorageTitle\(\)/);
  assert.match(restart, /complete: false/);
  assert.match(finishSave, /startFreshGroupedCustomWorkout\(groupedRestart\)/);

  const supersetConfig = restartApi.groupedCustomWorkoutRestartConfig(panel);
  assert.equal(Object.hasOwn(supersetConfig, "exerciseCount"), false);
  restartApi.startFreshGroupedCustomWorkout({ ...supersetConfig, exerciseCount: 8 });
  assert.equal(storedDrafts[0].format, "superset");
  assert.equal(storedDrafts[0].date, "2026-09-17");
  assert.deepEqual(storedDrafts[0].exercises.map((exercise) => exercise.code), ["CW01", "CW02"]);
  assert.deepEqual(storedDrafts[0].exercises.map((exercise) => exercise.group), [0, 0]);
  assert.ok(storedDrafts[0].exercises.every((exercise) => exercise.name === "" && exercise.groupType === "superset"));

  panel.dataset.customWorkoutFormat = "circuit";
  const circuitConfig = restartApi.groupedCustomWorkoutRestartConfig(panel);
  restartApi.startFreshGroupedCustomWorkout({ ...circuitConfig, exerciseCount: 8 });
  assert.equal(storedDrafts[1].format, "circuit");
  assert.deepEqual(storedDrafts[1].exercises.map((exercise) => exercise.code), ["CW01", "CW02", "CW03"]);
  assert.deepEqual(storedDrafts[1].exercises.map((exercise) => exercise.group), [0, 0, 0]);
  assert.ok(storedDrafts[1].exercises.every((exercise) => exercise.name === "" && exercise.groupType === "circuit"));
});

test("shares the grouped round renderer with assigned workouts", () => {
  const customGroup = sourceForFunction("customWorkoutCarouselGroupMarkup");
  const customRender = sourceForFunction("renderCustomWorkoutCarousel");
  const assignedGroup = sourceForFunction("assignedWorkoutCarouselMarkup");

  assert.match(customGroup, /customWorkoutGroupedRoundCardMarkup/);
  assert.match(customRender, /carousel\.dataset\.customWorkoutGrouped === "true"/);
  assert.match(customRender, /renderCustomWorkoutGroupedCard\(carousel\)/);
  assert.match(assignedGroup, /customWorkoutCarouselGroupMarkup/);
  assert.match(assignedGroup, /assigned: true/);
  assert.match(mobileStyles, /\[data-custom-workout-grouped="true"\]/);
});

test("shows the grouped session timer and finish action on the last group only", () => {
  const groupedMarkup = sourceForFunction("customWorkoutGroupedRoundCardMarkup");
  const initialGroups = sourceForFunction("customWorkoutCarouselMarkup");
  const regroup = sourceForFunction("regroupCustomWorkoutCarousels");

  assert.match(groupedMarkup, /const showSessionControls = format !== "single" && options\.isLastGroup !== false/);
  assert.match(groupedMarkup, /\$\{showSessionControls \? `[\s\S]*?data-custom-grouped-timer[\s\S]*?` : ""\}/);
  assert.match(
    groupedMarkup,
    /\$\{showSessionControls \? '<footer class="custom-workout-grouped-actions"><button type="button" data-custom-grouped-finish-workout>Finish workout<\/button><\/footer>' : ""\}/,
  );
  assert.match(initialGroups, /isLastGroup: index === groups\.length - 1/);
  assert.match(regroup, /isLastGroup: index === desiredGroups\.length - 1/);
  assert.match(
    regroup,
    /hasExpectedSessionControls[\s\S]*?data-custom-grouped-finish-workout[\s\S]*?index === desiredGroups\.length - 1/,
  );
});

test("checks pending rows across the full workout, including warm-ups and reopened rows", () => {
  const pendingRows = sourceForFunction("customWorkoutGroupedPendingRows");
  const finishPrompt = sourceForFunction("openCustomWorkoutGroupedFinishPanel");

  assert.match(pendingRows, /scope\?\.querySelectorAll\('\.custom-workout-grouped-row'\)/);
  assert.match(pendingRows, /const hasEntry = Array\.from\(visibleRow\.querySelectorAll\("\[data-custom-grouped-field\]"\)\)/);
  assert.match(
    pendingRows,
    /hasEntry \|\| canonicalRow\?\.dataset\.customGroupedReopened === "true"/,
  );
  assert.doesNotMatch(pendingRows, /data-custom-grouped-set-type|workingSetType|data-kind="round"/);
  assert.match(finishPrompt, /customWorkoutGroupedPendingRows\(panel\)\.length > 0/);
  assert.match(finishPrompt, /Log your edited or partially entered round before finishing the workout/);
});

test("protects grouped progress and final saves from deleting or rerendering future rows", () => {
  const finishSave = sourceForFunction("handleTrainingLogSave");

  assert.match(finishSave, /const groupedCustomWorkout = Boolean\(section\?\.querySelector\("\[data-custom-workout-grouped='true'\]"\)\)/);
  assert.match(
    finishSave,
    /const groupedSaveOptions = groupedCustomWorkout[\s\S]*?skipRemovedSetDelete: true, skipLogRefresh: true/,
  );
  assert.equal(
    (finishSave.match(/\.\.\.groupedSaveOptions/g) || []).length,
    2,
    "Grouped safeguards must cover both the progress save and final completion save",
  );
});

test("keeps the standalone start control hidden for grouped custom workouts", () => {
  const panelMarkup = sourceForFunction("customWorkoutPanelMarkup");

  assert.match(
    panelMarkup,
    /<div data-custom-workout-start-control \$\{format === "single" \? "" : "hidden"\}>/,
  );
  assert.match(panelMarkup, /\$\{workoutStartControlMarkup\(workoutStorageTitle\)\}/);
});

test("persists the grouped-round-required marker through draft save and restore", () => {
  const renderGrouped = sourceForFunction("renderCustomWorkoutGroupedCard");
  const serializeRow = sourceForFunction("serializeSetRowDraft");
  const applyRow = sourceForFunction("applyCustomSetDraft");
  const isLogged = sourceForFunction("isSetRowLogged");

  assert.match(renderGrouped, /row\.dataset\.groupedRoundRequired = "true"/);
  assert.match(serializeRow, /groupedRoundRequired: row\.dataset\.groupedRoundRequired === "true"/);
  assert.match(applyRow, /if \(draftSet\?\.groupedRoundRequired\)[\s\S]*?row\.dataset\.groupedRoundRequired = "true"/);
  assert.match(isLogged, /setRow\?\.dataset\.groupedRoundRequired === "true"/);
  assert.match(isLogged, /!setRow\.classList\.contains\("is-complete"\)[\s\S]*?return false/);
});

test("blocks round logging until every grouped exercise has a name", () => {
  const validateNames = sourceForFunction("validateCustomWorkoutGroupedExerciseNames");
  const logRound = sourceForFunction("logCustomWorkoutGroupedRound");

  assert.match(validateNames, /\[data-custom-workout-group-name-input\]/);
  assert.match(validateNames, /const firstBlank = inputs\.find/);
  assert.match(validateNames, /input\.setAttribute\("aria-invalid", "true"\)/);
  assert.match(validateNames, /carousel\.dataset\.groupNamesExpanded = "true"/);
  assert.match(validateNames, /toggle\?\.setAttribute\("aria-expanded", "true"\)/);
  assert.match(validateNames, /sectionLabel = "round"/);
  assert.match(validateNames, /Name every exercise before logging the \$\{sectionLabel\}/);
  assert.match(validateNames, /firstBlank\.focus\(\)/);
  assert.ok(
    logRound.indexOf("validateCustomWorkoutGroupedExerciseNames") <
      logRound.indexOf("validateCustomWorkoutGroupedSection"),
    "Exercise names should be validated before any round values are accepted",
  );
});

test("rolls warm-up completion back to its prior state when a grouped save fails", () => {
  const warmUps = sourceForFunction("completeEnteredCustomWorkoutWarmUps");
  const logRound = sourceForFunction("logCustomWorkoutGroupedRound");

  assert.match(warmUps, /const previousStates = canonicalRows\.map\(\(row\) => row\.classList\.contains\("is-complete"\)\)/);
  assert.match(warmUps, /return \{ valid: true, rows: canonicalRows, previousStates \}/);
  assert.match(logRound, /\.\.\.warmUps\.previousStates/);
  assert.match(logRound, /const changedRows = \[\.\.\.warmUps\.rows, \.\.\.roundRows\]/);
  assert.match(
    logRound,
    /if \(!result\.saved\) \{[\s\S]*?changedRows\.forEach\(\(row, index\) => setCustomWorkoutGroupedRowComplete\(row, previousStates\[index\]\)\)/,
  );
});

test("makes pending warm-up and round chips accessible and non-interactive until logged", () => {
  const rowMarkup = sourceForFunction("customWorkoutGroupedSetRowMarkup");
  const refresh = sourceForFunction("refreshCustomWorkoutGroupedCompletion");

  assert.match(rowMarkup, /const pendingRow = !complete/);
  assert.match(rowMarkup, /aria-label="\$\{escapeHtml\(complete \? `Reopen \$\{context\}` : `\$\{context\} not logged`\)\}"/);
  assert.match(rowMarkup, /\$\{pendingRow \? "disabled" : ""\}/);
  assert.match(refresh, /code\.disabled = !complete \|\| carousel\.dataset\.customGroupedWarmupSaving === "true"/);
  assert.match(refresh, /`\$\{context\} not logged`/);
});

test("rebuilds a grouped custom panel from its draft when switching back to Straight", () => {
  const updateFormat = sourceForFunction("updateCustomWorkoutFormat");
  const replacePanel = sourceForFunction("replaceCustomWorkoutPanelFromDraft");
  const panelMarkup = sourceForFunction("customWorkoutPanelMarkup");

  assert.match(
    updateFormat,
    /if \(format === "single" && previousFormat !== "single" && !options\.skipDraft\)/,
  );
  assert.match(
    updateFormat,
    /persistCustomWorkoutDraftFromPanel\(panel\);[\s\S]*?replaceCustomWorkoutPanelFromDraft\(panelIndex\)/,
  );
  assert.match(updateFormat, /activateClientWorkoutPanel\(panelIndex, \{ focus: false, scroll: false \}\)/);
  assert.match(updateFormat, /replacement\?\.querySelector\('\[data-custom-workout-format-option="single"\]'\)\?\.focus\(\);[\s\S]*?return/);
  assert.match(replacePanel, /template\.innerHTML = customWorkoutPanelMarkup\(index\)\.trim\(\)/);
  assert.match(replacePanel, /currentPanel\.replaceWith\(replacement\)/);
  assert.match(replacePanel, /applyCustomWorkoutDraft\(replacement\)/);
  assert.match(replacePanel, /syncWorkoutStartButtons\(\)/);
  assert.match(
    panelMarkup,
    /<div data-custom-workout-default-finish \$\{format === "single" \? "" : "hidden"\}>/,
  );
});

test("validates exercise names in every grouped carousel before opening Finish", () => {
  const finishPrompt = sourceForFunction("openCustomWorkoutGroupedFinishPanel");

  assert.match(
    finishPrompt,
    /Array\.from\(panel\.querySelectorAll\("\[data-custom-workout-grouped='true'\]"\)\)/,
  );
  assert.match(
    finishPrompt,
    /\.find\(\(groupedCarousel\) => !validateCustomWorkoutGroupedExerciseNames\(groupedCarousel\)\)/,
  );
  assert.match(finishPrompt, /if \(invalidNameCarousel\) return/);
  assert.ok(
    finishPrompt.indexOf("invalidNameCarousel") < finishPrompt.indexOf("ensureCustomWorkoutGroupedFinishPanel"),
    "All grouped exercise names must validate before the completion dialog opens",
  );
});

test("keys grouped timer rendering, conflicts, and start-resume behavior by title and date", () => {
  const renderTimer = sourceForFunction("renderCustomWorkoutGroupedTimerPanels");
  const timerConflict = sourceForFunction("customWorkoutGroupedTimerConflict");
  const interactions = sourceForFunction("handleWorkoutInteractions");

  assert.match(renderTimer, /const workoutTitle = String\(panel\?\.dataset\.customWorkoutTitle/);
  assert.match(renderTimer, /const workoutDate = panel\?\.querySelector\("\[data-workout-date\]"\)\?\.value \|\| todayDate\(\)/);
  assert.match(
    renderTimer,
    /workoutTitle === String\(workoutElapsedTimerState\.workoutTitle \|\| ""\)\.trim\(\) &&[\s\S]*?workoutDate === String\(workoutElapsedTimerState\.workoutDate \|\| ""\)/,
  );
  assert.match(
    timerConflict,
    /String\(workoutElapsedTimerState\.workoutTitle \|\| ""\)\.trim\(\) !== workoutTitle \|\|[\s\S]*?String\(workoutElapsedTimerState\.workoutDate \|\| ""\) !== workoutDate/,
  );
  assert.match(
    interactions,
    /const isActiveWorkout = Boolean\([\s\S]*?workoutTitle === String\(workoutElapsedTimerState\.workoutTitle \|\| ""\)\.trim\(\) &&[\s\S]*?workoutDate === String\(workoutElapsedTimerState\.workoutDate \|\| ""\)[\s\S]*?\)/,
  );
  assert.match(interactions, /startWorkoutElapsedTimer\(workoutTitle, \{ workoutDate, panelIndex \}\)/);
});
