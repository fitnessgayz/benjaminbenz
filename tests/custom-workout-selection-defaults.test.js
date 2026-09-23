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

test("fresh grouped workouts start with their exact default exercise counts", () => {
  const defaultCountSource = sourceForFunction("customWorkoutDefaultExerciseCount");
  const exercisesSource = sourceForFunction("customWorkoutExercises");
  const enteredContentSource = sourceForFunction("customWorkoutPanelHasEnteredExerciseContent");
  const resizeDefaultsSource = sourceForFunction("setUntouchedCustomWorkoutDefaultExercises");
  const panelMarkup = sourceForFunction("customWorkoutPanelMarkup");
  const carouselMarkup = sourceForFunction("customWorkoutCarouselMarkup");
  const updateFormat = sourceForFunction("updateCustomWorkoutFormat");
  let draftExercises = [];
  const defaults = Function(
    "customWorkoutDraftExercises",
    "customExerciseCode",
    "normalizeCustomWorkoutInlineGroupType",
    "normalizeCustomWorkoutFormat",
    "activeCustomWorkoutFormat",
    "activeCustomWorkoutDraft",
    `${defaultCountSource}; ${exercisesSource}; return { customWorkoutDefaultExerciseCount, customWorkoutExercises };`
  )(
    () => draftExercises,
    (index) => `CW${String(index + 1).padStart(2, "0")}`,
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    "single",
    () => null
  );

  assert.equal(defaults.customWorkoutDefaultExerciseCount("single"), 4);
  assert.equal(defaults.customWorkoutDefaultExerciseCount("superset"), 2);
  assert.equal(defaults.customWorkoutDefaultExerciseCount("circuit"), 3);
  assert.equal(defaults.customWorkoutDefaultExerciseCount("unknown"), 4);
  assert.deepEqual(defaults.customWorkoutExercises("superset").map((exercise) => exercise.code), ["CW01", "CW02"]);
  assert.deepEqual(defaults.customWorkoutExercises("circuit").map((exercise) => exercise.code), ["CW01", "CW02", "CW03"]);
  assert.equal(defaults.customWorkoutExercises("single").length, 4);

  draftExercises = [{ code: "CW01", name: "Existing exercise", group: 0, groupType: "single" }];
  assert.deepEqual(defaults.customWorkoutExercises("superset").map((exercise) => exercise.name), ["Existing exercise"]);
  assert.deepEqual(defaults.customWorkoutExercises("circuit").map((exercise) => exercise.name), ["Existing exercise"]);

  let generatedCard = 0;
  const resizeDefaults = Function(
    "normalizeCustomWorkoutFormat",
    "appendInlineGroupingPartner",
    `${defaultCountSource}; ${resizeDefaultsSource}; return setUntouchedCustomWorkoutDefaultExercises;`
  )(
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    () => ({ id: `generated-${generatedCard += 1}`, remove() {} })
  );
  const circuitCards = resizeDefaults({}, "circuit", [{ id: "existing", remove() {} }]);
  assert.equal(circuitCards.length, 3);
  const removableCards = Array.from({ length: 3 }, (_, index) => ({
    id: `card-${index + 1}`,
    removed: false,
    remove() { this.removed = true; }
  }));
  const supersetCards = resizeDefaults({}, "superset", removableCards);
  assert.equal(supersetCards.length, 2);
  assert.equal(removableCards[2].removed, true);
  const straightCards = resizeDefaults({}, "single", removableCards.slice(0, 2));
  assert.equal(straightCards.length, 4);
  assert.equal(removableCards[1].removed, false);

  const hasEnteredContent = Function(
    "exerciseNameInputForLog",
    `${enteredContentSource}; return customWorkoutPanelHasEnteredExerciseContent;`
  )((logElement) => logElement.nameInput);
  const exercisePanel = (logElement, auxiliaryLogs = []) => ({
    querySelectorAll(selector) {
      if (selector === "[data-custom-exercise-card] [data-exercise-log]") return [logElement];
      if (selector === "[data-exercise-log]") return [logElement, ...auxiliaryLogs];
      return [];
    }
  });
  const exerciseLog = (name = "", weight = "") => ({
    nameInput: { value: name },
    dataset: {},
    querySelector(selector) {
      return selector === "[data-log-notes]" ? { value: "" } : null;
    },
    querySelectorAll(selector) {
      if (selector !== "[data-set-row]") return [];
      return [{
        dataset: {},
        classList: { contains: () => false },
        querySelector(field) {
          if (field === "[data-set-weight]") return { value: weight };
          if (field === "[data-set-reps]") return { value: "" };
          if (field === "[data-complete-set]") return { getAttribute: () => "false" };
          return null;
        }
      }];
    }
  });
  const defaultWarmUp = exerciseLog("Warm up", "");
  const defaultCardio = exerciseLog("Cardio", "");
  assert.match(enteredContentSource, /querySelectorAll\("\[data-custom-exercise-card\] \[data-exercise-log\]"\)/);
  assert.equal(hasEnteredContent(exercisePanel(exerciseLog(), [defaultWarmUp, defaultCardio])), false);
  assert.equal(hasEnteredContent(exercisePanel(exerciseLog("Saved row"))), true);
  assert.equal(hasEnteredContent(exercisePanel(exerciseLog("", "135"))), true);

  assert.match(panelMarkup, /const exercises = customWorkoutExercises\(format\)/);
  assert.match(carouselMarkup, /const exercises = customWorkoutExercises\(format\)/);
  assert.match(
    updateFormat,
    /format !== previousFormat &&[\s\S]*?!options\.skipDraft &&[\s\S]*?!customWorkoutPanelHasEnteredExerciseContent\(panel\)[\s\S]*?setUntouchedCustomWorkoutDefaultExercises\(panel, format, currentCards\)/
  );
  assert.ok(
    updateFormat.indexOf("setUntouchedCustomWorkoutDefaultExercises(panel, format, currentCards)") <
      updateFormat.indexOf("syncCustomWorkoutCarousel(panel"),
    "Expected fresh default cards to be sized before the deck is regrouped"
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
    /workoutFinishIssues\(section, \{ allowUnstarted: allowIncompleteWorkoutFinish \}\)/,
    "Choosing Workout Finished may omit untouched later rows, while partially entered fields still validate"
  );
  assert.match(saveSource, /if \(!showWorkoutFinishIssues\(difficultyTrigger, issues\)\) return/);
  assert.match(
    saveSource,
    /finally \{[\s\S]*?if \(allowIncompleteWorkoutFinish && !completionSucceeded\) workoutButton\.dataset\.allowIncompleteWorkoutFinish = "true";/,
    "Cancelled or unsuccessful completion should preserve early-finish intent for retry"
  );
  assert.match(
    interactionSource,
    /event\.key === "Tab" && nextExerciseOverlay\?\.hidden === false[\s\S]*?lastButton\.focus\(\)[\s\S]*?firstButton\.focus\(\)/,
    "Keyboard focus should remain within the two-choice prompt"
  );
});
