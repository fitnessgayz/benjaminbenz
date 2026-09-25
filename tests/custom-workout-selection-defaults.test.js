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

test("fresh workouts start with six straight exercises, five supersets, or five circuits", () => {
  const defaultCountSource = sourceForFunction("customWorkoutDefaultExerciseCount");
  const defaultGroupSource = sourceForFunction("customWorkoutDefaultExerciseGroup");
  const addConfigSource = sourceForFunction("customWorkoutExerciseAddConfig");
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
    `${addConfigSource}; ${defaultCountSource}; ${defaultGroupSource}; ${exercisesSource}; return { customWorkoutDefaultExerciseCount, customWorkoutExercises };`
  )(
    () => draftExercises,
    (index) => `CW${String(index + 1).padStart(2, "0")}`,
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    "single",
    () => null
  );

  assert.equal(defaults.customWorkoutDefaultExerciseCount("single"), 6);
  assert.equal(defaults.customWorkoutDefaultExerciseCount("superset"), 10);
  assert.equal(defaults.customWorkoutDefaultExerciseCount("circuit"), 15);
  assert.equal(defaults.customWorkoutDefaultExerciseCount("unknown"), 6);
  assert.deepEqual(defaults.customWorkoutExercises("superset").map((exercise) => exercise.group), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual(defaults.customWorkoutExercises("circuit").map((exercise) => exercise.group), [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
  assert.equal(defaults.customWorkoutExercises("single").length, 6);

  const renderedGroups = [];
  const renderCarousel = Function(
    "customWorkoutExercises",
    "customWorkoutCarouselGroupMarkup",
    `${carouselMarkup}; return customWorkoutCarouselMarkup;`
  )(defaults.customWorkoutExercises, (format, exercises, group, startIndex) => {
    renderedGroups.push({ format, count: exercises.length, group, startIndex });
    return "";
  });
  for (const [format, size] of [["superset", 2], ["circuit", 3]]) {
    renderedGroups.length = 0;
    renderCarousel(format, "Custom workout");
    assert.equal(renderedGroups.length, 5);
    assert.deepEqual(renderedGroups.map((group) => group.count), [size, size, size, size, size]);
    assert.deepEqual(renderedGroups.map((group) => group.group), [0, 1, 2, 3, 4]);
    assert.deepEqual(renderedGroups.map((group) => group.startIndex), [0, size, size * 2, size * 3, size * 4]);
  }

  draftExercises = [{ code: "CW01", name: "Existing exercise", group: 0, groupType: "single" }];
  assert.deepEqual(defaults.customWorkoutExercises("superset").map((exercise) => exercise.name), ["Existing exercise"]);
  assert.deepEqual(defaults.customWorkoutExercises("circuit").map((exercise) => exercise.name), ["Existing exercise"]);

  let generatedCard = 0;
  const resizeDefaults = Function(
    "normalizeCustomWorkoutFormat",
    "appendInlineGroupingPartner",
    `${addConfigSource}; ${defaultCountSource}; ${defaultGroupSource}; ${resizeDefaultsSource}; return setUntouchedCustomWorkoutDefaultExercises;`
  )(
    (value) => ["superset", "circuit"].includes(value) ? value : "single",
    () => ({ id: `generated-${generatedCard += 1}`, dataset: {}, remove() {} })
  );
  const circuitCards = resizeDefaults({}, "circuit", [{ id: "existing", dataset: {}, remove() {} }]);
  assert.equal(circuitCards.length, 15);
  assert.deepEqual(circuitCards.map((card) => card.dataset.customWorkoutGroup), ["0", "0", "0", "1", "1", "1", "2", "2", "2", "3", "3", "3", "4", "4", "4"]);
  assert.ok(circuitCards.every((card) => card.dataset.customWorkoutGroupType === "circuit"));
  const removableCards = Array.from({ length: 15 }, (_, index) => ({
    id: `card-${index + 1}`,
    dataset: {},
    removed: false,
    remove() { this.removed = true; }
  }));
  const supersetCards = resizeDefaults({}, "superset", removableCards);
  assert.equal(supersetCards.length, 10);
  assert.deepEqual(supersetCards.map((card) => card.dataset.customWorkoutGroup), ["0", "0", "1", "1", "2", "2", "3", "3", "4", "4"]);
  assert.equal(removableCards[10].removed, true);
  const straightCards = resizeDefaults({}, "single", removableCards.slice(0, 2));
  assert.equal(straightCards.length, 6);
  assert.ok(straightCards.every((card) => card.dataset.customWorkoutGroup === "0" && card.dataset.customWorkoutGroupType === "single"));
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
