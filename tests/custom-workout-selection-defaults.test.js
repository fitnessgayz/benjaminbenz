const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("selecting an exercise suggestion closes the list and releases mobile focus", () => {
  const selectionSource = sourceForFunction("selectCustomExerciseSuggestion");
  const interactionSource = sourceForFunction("handleWorkoutInteractions");
  const rowMarkup = sourceForFunction("customWorkoutGroupNameRowMarkup");
  const closeCalls = [];
  const dispatchedEvents = [];
  let inputBlurred = 0;
  let buttonBlurred = 0;
  const input = {
    value: "",
    dispatchEvent(event) {
      dispatchedEvents.push(event);
    },
    blur() {
      inputBlurred += 1;
    }
  };
  const editor = {
    querySelector(selector) {
      return selector === "[data-exercise-title-name]" ? input : null;
    }
  };
  const button = {
    dataset: { customExerciseSuggestion: "Incline Machine Chest Press" },
    closest(selector) {
      return selector === ".custom-workout-name-editor" ? editor : null;
    },
    blur() {
      buttonBlurred += 1;
    }
  };
  class FakeEvent {
    constructor(type, options) {
      this.type = type;
      this.bubbles = Boolean(options?.bubbles);
    }
  }
  const selectSuggestion = Function(
    "Event",
    "closeCustomExerciseSuggestions",
    `${selectionSource}; return selectCustomExerciseSuggestion;`
  )(FakeEvent, () => closeCalls.push(true));

  assert.equal(selectSuggestion(button), true);
  assert.equal(input.value, "Incline Machine Chest Press");
  assert.equal(dispatchedEvents.length, 1);
  assert.equal(dispatchedEvents[0].type, "input");
  assert.equal(dispatchedEvents[0].bubbles, true);
  assert.equal(inputBlurred, 1);
  assert.equal(buttonBlurred, 1);
  assert.equal(closeCalls.length, 1);
  assert.match(
    interactionSource,
    /if \(exerciseSuggestionButton\) \{\s*event\.preventDefault\(\);\s*selectCustomExerciseSuggestion\(exerciseSuggestionButton\);/
  );
  assert.match(rowMarkup, /<div class="custom-workout-group-name-row">/);
  assert.doesNotMatch(rowMarkup, /<label class="custom-workout-group-name-row"/);
});

test("a fresh superset starts with exactly two exercise cards", () => {
  const exercisesSource = sourceForFunction("customWorkoutExercises");
  const panelMarkup = sourceForFunction("customWorkoutPanelMarkup");
  const carouselMarkup = sourceForFunction("customWorkoutCarouselMarkup");
  const updateFormat = sourceForFunction("updateCustomWorkoutFormat");
  let draftExercises = [];
  const buildExercises = Function(
    "customWorkoutDraftExercises",
    "customExerciseCode",
    "normalizeCustomWorkoutInlineGroupType",
    "normalizeCustomWorkoutFormat",
    "activeCustomWorkoutFormat",
    `${exercisesSource}; return customWorkoutExercises;`
  )(
    () => draftExercises,
    (index) => `CW${String(index + 1).padStart(2, "0")}`,
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    "single"
  );

  assert.deepEqual(buildExercises("superset").map((exercise) => exercise.code), ["CW01", "CW02"]);
  assert.equal(buildExercises("single").length, 1);
  assert.equal(buildExercises("circuit").length, 1);

  draftExercises = [{ code: "CW01", name: "Existing exercise", group: 0, groupType: "single" }];
  assert.deepEqual(buildExercises("superset").map((exercise) => exercise.name), ["Existing exercise"]);

  assert.match(panelMarkup, /const exercises = customWorkoutExercises\(format\)/);
  assert.match(carouselMarkup, /const exercises = customWorkoutExercises\(format\)/);
  assert.match(
    updateFormat,
    /format === "superset"[\s\S]*?customWorkoutDraftExercises\(\)\.length === 0[\s\S]*?currentCards\.length === 1[\s\S]*?appendInlineGroupingPartner\(panel\)/
  );
  assert.ok(
    updateFormat.indexOf("appendInlineGroupingPartner(panel)") <
      updateFormat.indexOf("syncCustomWorkoutCarousel(panel"),
    "Expected the fresh A2 card to be added before the deck is regrouped"
  );
});

test("the exercise-finished prompt offers two direct workout choices", () => {
  const promptMarkup = sourceForFunction("nextExercisePromptMarkup");
  const interactionSource = sourceForFunction("handleWorkoutInteractions");
  const saveSource = sourceForFunction("handleTrainingLogSave");

  assert.match(promptMarkup, /id="next-exercise-title">Exercise finished</);
  assert.match(promptMarkup, /data-next-exercise-yes>Start New Exercise</);
  assert.match(promptMarkup, /data-next-exercise-finish>Workout Finished</);
  assert.equal((promptMarkup.match(/<button/g) || []).length, 2);
  assert.doesNotMatch(promptMarkup, /Not now|Would you like|data-next-exercise-no|data-next-exercise-close/);
  assert.match(
    interactionSource,
    /if \(nextExerciseFinishButton\) \{[\s\S]*?const finishWorkoutButton = panel\?\.querySelector\("\[data-workout-finish\]"\);[\s\S]*?finishWorkoutButton\.dataset\.allowIncompleteWorkoutFinish = "true";[\s\S]*?finishWorkoutButton\.click\(\);/
  );
  assert.doesNotMatch(
    interactionSource,
    /event\.target\.matches\("\[data-next-exercise-overlay\]"\)/,
    "The backdrop should not act like an unlabelled third choice"
  );
  assert.match(
    saveSource,
    /const allowIncompleteWorkoutFinish = workoutButton\?\.dataset\.allowIncompleteWorkoutFinish === "true";[\s\S]*?delete workoutButton\.dataset\.allowIncompleteWorkoutFinish;/
  );
  assert.match(
    saveSource,
    /if \(incompleteExercises\.length > 0 && !allowIncompleteWorkoutFinish\)/,
    "Choosing Workout Finished should use the canonical completion flow even when later cards are incomplete"
  );
  assert.ok(
    (saveSource.match(/workoutButton\.dataset\.allowIncompleteWorkoutFinish = "true";/g) || []).length >= 2,
    "A failed completion save or difficulty save should preserve the early-finish intent for retry"
  );
  assert.match(
    interactionSource,
    /event\.key === "Tab" && nextExerciseOverlay\?\.hidden === false[\s\S]*?lastButton\.focus\(\)[\s\S]*?firstButton\.focus\(\)/,
    "Keyboard focus should remain within the two-choice prompt"
  );
});
