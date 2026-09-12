const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("renders the same lifted deck shell for custom and assigned grouped workouts", () => {
  const customMarkup = sourceForFunction("customWorkoutCarouselGroupMarkup");
  const assignedMarkup = sourceForFunction("assignedWorkoutCarouselMarkup");
  const nextCardMarkup = sourceForFunction("workoutGroupDeckNextCardMarkup");

  [customMarkup, assignedMarkup].forEach((markup) => {
    assert.match(markup, /data-custom-workout-exercise-deck/);
    assert.equal((markup.match(/custom-workout-deck-layer/g) || []).length, 4);
    assert.match(markup, /workoutGroupDeckNextCardMarkup\(\)/);
  });
  assert.match(nextCardMarkup, /data-workout-group-next-card/);
  assert.match(nextCardMarkup, /data-workout-group-next-label/);
  assert.match(nextCardMarkup, /data-workout-group-next-name/);
});

test("keeps grouped deck visuals separate from straight-set add permission", () => {
  const render = sourceForFunction("renderCustomWorkoutCarousel");
  const move = sourceForFunction("moveCustomWorkoutCarousel");

  assert.match(render, /const straightDeckEnabled = mobile && isCustomPanel && format === "single"/);
  assert.match(render, /const groupDeckEnabled = mobile && format !== "single"/);
  assert.match(render, /dataset\.customWorkoutDeck = deckEnabled/);
  assert.match(render, /dataset\.customWorkoutCanAddExercise = canAddExercise/);
  assert.match(move, /const canAddExercise = carousel\.dataset\.customWorkoutCanAddExercise === "true"/);
  assert.match(move, /const isVisualDeck = carousel\.dataset\.customWorkoutDeck === "true"/);
  assert.match(move, /if \(isVisualDeck && index !== currentIndex/);
});

test("builds the next-card cue for superset and circuit sequences", () => {
  const cueSource = sourceForFunction("workoutCarouselDeckCue");
  const cueFor = Function(
    "groupTypeLabel",
    `${cueSource}; return workoutCarouselDeckCue;`
  )((format) => format === "circuit" ? "Circuit" : "Superset");
  const supersetProgress = {
    isComplete: false,
    exercises: [
      { code: "A1", name: "Shoulder Press" },
      { code: "A2", name: "Goblet Squat" }
    ]
  };
  const circuitProgress = {
    isComplete: false,
    exercises: [
      { code: "C1", name: "Kettlebell Deadlift" },
      { code: "C2", name: "Incline Push-Up" },
      { code: "C3", name: "Reverse Lunge" }
    ]
  };

  assert.deepEqual(cueFor(supersetProgress, 0, "superset"), {
    hidden: false,
    complete: false,
    label: "Up next · A2",
    name: "Goblet Squat",
    targetIndex: 1
  });
  assert.deepEqual(cueFor(supersetProgress, 1, "superset"), {
    hidden: false,
    complete: false,
    label: "Next round · A1",
    name: "Shoulder Press",
    targetIndex: 0
  });
  assert.equal(cueFor(circuitProgress, 0, "circuit").label, "Up next · Station 2");
  assert.equal(cueFor(circuitProgress, 2, "circuit").label, "Next round · Station 1");
  assert.deepEqual(cueFor({ ...supersetProgress, isComplete: true }, 1, "superset"), {
    hidden: false,
    complete: true,
    label: "Superset complete ✓",
    name: "All rounds are saved.",
    targetIndex: -1
  });
});

test("green completion state requires persisted progress for every grouped exercise", () => {
  const render = sourceForFunction("renderCustomWorkoutCarousel");

  assert.match(render, /"is-superset-complete",[\s\S]*?format === "superset" && cards\.length > 1 && progress\.isComplete/);
  assert.match(render, /"is-circuit-complete",[\s\S]*?format === "circuit" && cards\.length > 1 && progress\.isComplete/);
  assert.match(mobileStyles, /\.is-superset-complete, \.is-circuit-complete\)[\s\S]*?border-color: #21a637;[\s\S]*?background: #f5faf4;/);
  assert.match(mobileStyles, /\.is-superset-complete, \.is-circuit-complete\) \.custom-workout-deck-layer \{[\s\S]*?background: #dff5df;/);
  assert.match(mobileStyles, /\.is-superset-complete, \.is-circuit-complete\) \.custom-workout-card\.is-carousel-active \{[\s\S]*?border-color: #21a637 !important;/);
});

test("group logging still autosaves before advancing the deck", () => {
  const logSet = sourceForFunction("logCurrentWorkoutCarouselSet");
  const savingIndex = logSet.indexOf('setWorkoutCarouselAutosaveState(logElement, "saving")');
  const saveIndex = logSet.indexOf("await saveTrainingLogRows");
  const progressIndex = logSet.indexOf("const nextProgress = workoutCarouselProgress");
  const moveIndex = logSet.indexOf("moveCustomWorkoutCarousel(carousel, nextProgress.current.index)");

  assert.ok(savingIndex >= 0 && savingIndex < saveIndex);
  assert.ok(saveIndex < progressIndex && progressIndex < moveIndex);
  assert.match(logSet, /if \(!result\.saved\) \{[\s\S]*?setWorkoutCarouselAutosaveState\(logElement, "issue"\);[\s\S]*?return;/);
});

test("group decks wrap into the next round by arrow, swipe, and keyboard", () => {
  const render = sourceForFunction("renderCustomWorkoutCarousel");
  const move = sourceForFunction("moveCustomWorkoutCarousel");

  assert.match(render, /const wrapsGroupDeck = groupDeckEnabled && cards\.length > 1/);
  assert.match(render, /previous\.disabled = !wrapsGroupDeck && activeIndex === 0/);
  assert.match(render, /next\.disabled = !addsExercise && !wrapsGroupDeck && activeIndex === cards\.length - 1/);
  assert.match(move, /carousel\.dataset\.groupWorkoutDeck === "true"/);
  assert.match(move, /customWorkoutCarouselNavigationDecision\([\s\S]*?wrapsGroupDeck/);
});

test("changing workout dates recalculates grouped completion before rerendering", () => {
  const syncDate = sourceForFunction("syncWorkoutPanelDate");
  const updateLog = sourceForFunction("updateExerciseLogField");
  const syncFinished = sourceForFunction("syncExerciseFinishedState");

  assert.match(syncDate, /const carouselsToRefresh = new Set\(\)/);
  assert.match(syncDate, /updateExerciseLogField\(logElement\)[\s\S]*?groupLoggedSets = String\(filledSetCount\(logElement\)\)/);
  assert.match(syncDate, /carouselsToRefresh\.forEach\(\(carousel\) => renderCustomWorkoutCarousel\(carousel\)\)/);
  assert.match(updateLog, /updateVisibleSetProgress\(logElement\);[\s\S]*?syncExerciseFinishedState\(logElement\);/);
  assert.match(syncFinished, /classList\.toggle\("is-exercise-complete", completed\)/);
  assert.match(syncFinished, /finishButton\.textContent = completed[\s\S]*?"Finished ✓"/);
  assert.match(syncFinished, /finishButton\.setAttribute\("aria-pressed", completed \? "true" : "false"\)/);
});

test("a singleton assigned superset becomes a grouped deck when its partner is added", () => {
  const supersetMarkup = sourceForFunction("supersetRows");
  const interactionStart = portal.indexOf("if (addAssignedExerciseButton) {");
  const interactionEnd = portal.indexOf("\n  });", interactionStart);
  const interaction = portal.slice(interactionStart, interactionEnd);

  assert.match(supersetMarkup, /assignedWorkoutCarouselMarkup\([\s\S]*?"superset"/);
  assert.doesNotMatch(supersetMarkup, /group\.exercises\.length > 1 \? "superset" : "single"/);
  assert.match(interaction, /targetCarousel\.dataset\.customWorkoutFormat = "superset"/);
  assert.match(interaction, /targetList\.dataset\.customWorkoutFormat = "superset"/);
});
