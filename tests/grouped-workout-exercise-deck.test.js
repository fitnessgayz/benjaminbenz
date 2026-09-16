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
  assert.match(nextCardMarkup, /<button[\s\S]*?type="button"[\s\S]*?data-workout-group-next-card/);
  assert.match(nextCardMarkup, /data-workout-group-next-card/);
  assert.match(nextCardMarkup, /data-workout-group-next-label/);
  assert.match(nextCardMarkup, /data-workout-group-next-name/);
  assert.doesNotMatch(nextCardMarkup, /aria-hidden="true" hidden/);
});

test("renders the group log action inside each grouped exercise card", () => {
  const logFields = sourceForFunction("exerciseLogFields");
  const customCard = sourceForFunction("customWorkoutCardMarkup");
  const assignedCard = sourceForFunction("exerciseCard");
  const customCarousel = sourceForFunction("customWorkoutCarouselGroupMarkup");
  const assignedCarousel = sourceForFunction("assignedWorkoutCarouselMarkup");

  assert.match(
    logFields,
    /<\/div>\s*\$\{options\.groupActionSlot \? `[\s\S]*?data-workout-group-primary-action[\s\S]*?data-workout-group-log-set[\s\S]*?` : ""\}\s*<div class="exercise-notes/,
  );
  assert.match(customCard, /groupActionSlot: true/);
  assert.match(assignedCard, /groupActionSlot: format !== "single"/);
  assert.doesNotMatch(customCarousel, /data-workout-group-primary-action/);
  assert.doesNotMatch(assignedCarousel, /data-workout-group-primary-action/);
});

test("removes per-row completion buttons from superset and circuit cards", () => {
  const rowMarkup = sourceForFunction("setRowMarkup");
  const rowsMarkup = sourceForFunction("setRows");
  const logFields = sourceForFunction("exerciseLogFields");
  const customCard = sourceForFunction("customWorkoutCardMarkup");
  const assignedCard = sourceForFunction("exerciseCard");

  assert.match(rowMarkup, /options\.showComplete === false \? ""/);
  assert.match(rowsMarkup, /setRowMarkup\([\s\S]*?options\)/);
  assert.match(logFields, /showComplete: options\.showSetComplete !== false/);
  assert.match(customCard, /showSetComplete: cardFormat === "single"/);
  assert.match(assignedCard, /showSetComplete: format === "single"/);
  assert.match(
    mobileStyles,
    /data-custom-workout-format="superset"[\s\S]*?data-custom-workout-format="circuit"[\s\S]*?\.set-row \{[\s\S]*?grid-template-columns: 40px minmax\(0, 1fr\) minmax\(0, 1fr\) 50px !important;/
  );
  assert.match(
    mobileStyles,
    /data-custom-workout-format="superset"[\s\S]*?data-custom-workout-format="circuit"[\s\S]*?\.set-complete-button \{[\s\S]*?display: none !important;/
  );
});

test("keeps a dormant log-action slot when a straight custom card is regrouped", () => {
  const customCard = sourceForFunction("customWorkoutCardMarkup");
  const regroup = sourceForFunction("regroupCustomWorkoutCarousels");
  const updateFormat = sourceForFunction("updateCustomWorkoutFormat");

  assert.match(customCard, /groupActionSlot: true/);
  assert.match(regroup, /existing\[groupIndex\]/);
  assert.match(updateFormat, /syncCustomWorkoutCarousel\(panel, \{ activeIndex: 0/);
  assert.match(sourceForFunction("syncCustomWorkoutCarousel"), /regroupCustomWorkoutCarousels\(panel\)/);
});

test("shows the log action only on the visible exercise that is next to save", () => {
  const syncSource = sourceForFunction("syncWorkoutGroupPrimaryActions");
  const syncActions = Function(
    "groupTypeLabel",
    `${syncSource}; return syncWorkoutGroupPrimaryActions;`
  )((format) => format === "circuit" ? "Circuit" : "Superset");

  function fakeCard() {
    const button = { textContent: "", disabled: false };
    const cue = { textContent: "" };
    const action = {
      hidden: true,
      dataset: {},
      classList: { toggle(name, value) { this[name] = value; } },
      querySelector(selector) {
        if (selector === "[data-workout-group-log-set]") return button;
        if (selector === "[data-custom-workout-carousel-cue]") return cue;
        return null;
      }
    };
    return {
      action,
      button,
      cue,
      querySelector(selector) {
        return selector === "[data-workout-group-primary-action]" ? action : null;
      }
    };
  }

  const cards = [fakeCard(), fakeCard()];
  const progress = {
    isComplete: false,
    current: { index: 0 },
    nextIndex: 1,
    exercises: [{ code: "A1" }, { code: "A2" }]
  };

  syncActions(cards, progress, 0, true, "superset");
  assert.equal(cards[0].action.hidden, false);
  assert.equal(cards[0].button.textContent, "Log set · Next: A2");
  assert.equal(cards[0].cue.textContent, "No rest until the full superset round is complete.");
  assert.equal(cards[1].action.hidden, true);

  syncActions(cards, progress, 1, true, "superset");
  assert.equal(cards[0].action.hidden, true);
  assert.equal(cards[1].action.hidden, true);

  syncActions(cards, { ...progress, isComplete: true, current: null, nextIndex: -1 }, 1, true, "superset");
  assert.equal(cards[1].action.hidden, false);
  assert.equal(cards[1].button.textContent, "Superset complete ✓");
  assert.equal(cards[1].button.disabled, true);
});

test("keeps the in-card group action full-width and overflow-safe on mobile", () => {
  assert.match(mobileStyles, /\.workout-group-primary-action \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?padding: 10px 0 0;/);
  assert.match(mobileStyles, /\.workout-group-primary-action\[hidden\] \{[\s\S]*?display: none !important;/);
  assert.match(mobileStyles, /\[data-workout-group-log-set\] \{[\s\S]*?width: 100%;[\s\S]*?min-width: 0;[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
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
  assert.match(move, /isVisualDeck && index !== currentIndex/);
});

test("places collapsible A1 A2 exercise-name editors above the grouped swipe deck", () => {
  const groupMarkup = sourceForFunction("customWorkoutCarouselGroupMarkup");
  const editorMarkup = sourceForFunction("customWorkoutGroupNameEditorMarkup");
  const rowMarkup = sourceForFunction("customWorkoutGroupNameRowMarkup");
  const syncEditor = sourceForFunction("syncCustomWorkoutGroupNameEditor");
  const cardMarkup = sourceForFunction("customWorkoutCardMarkup");
  const interactions = sourceForFunction("handleWorkoutInteractions");

  assert.match(groupMarkup, /customWorkoutGroupNameEditorMarkup\(format, exercises, groupIndex\)/);
  assert.match(groupMarkup, /customWorkoutGroupNameEditorMarkup[\s\S]*?data-custom-workout-exercise-deck/);
  assert.match(editorMarkup, /format === "single"[\s\S]*?return ""/);
  assert.match(editorMarkup, /data-custom-workout-group-name-toggle/);
  assert.match(editorMarkup, /data-custom-workout-group-name-fields/);
  assert.match(rowMarkup, /workoutCarouselExerciseCode\(format, groupIndex, index\)/);
  assert.match(rowMarkup, /data-custom-workout-group-name-input="\$\{index\}"/);
  assert.match(syncEditor, /cardCode\.textContent = position/);
  assert.match(cardMarkup, /data-custom-workout-group-card-code hidden/);
  assert.match(interactions, /data-custom-workout-group-name-toggle/);
  assert.match(interactions, /data-custom-workout-group-name-input/);
  assert.match(interactions, /groupedCardInput\.value = exerciseNameInput\.value/);
  assert.match(mobileStyles, /data-custom-workout-format="superset"[\s\S]*?\.custom-workout-editable-title[\s\S]*?display: none !important/);
  assert.match(mobileStyles, /\.custom-workout-group-card-code \{[\s\S]*?display: inline-flex !important/);
  assert.match(mobileStyles, /\.custom-workout-group-name-row \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(mobileStyles, /\.custom-workout-group-name-row > strong \{[\s\S]*?width: fit-content;[\s\S]*?min-height: 32px;/);
});

test("uses A1 A2 labels for both superset and circuit groups", () => {
  const codeSource = sourceForFunction("workoutCarouselExerciseCode");
  const codeFor = Function(`${codeSource}; return workoutCarouselExerciseCode;`)();

  assert.equal(codeFor("superset", 0, 0), "A1");
  assert.equal(codeFor("superset", 0, 1), "A2");
  assert.equal(codeFor("circuit", 0, 2), "A3");
  assert.equal(codeFor("circuit", 1, 0), "B1");
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
      { code: "A1", name: "Kettlebell Deadlift" },
      { code: "A2", name: "Incline Push-Up" },
      { code: "A3", name: "Reverse Lunge" }
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
  assert.equal(cueFor(circuitProgress, 0, "circuit").label, "Up next · A2");
  assert.deepEqual(cueFor(circuitProgress, 2, "circuit"), {
    hidden: false,
    complete: false,
    label: "Next round · A1",
    name: "Kettlebell Deadlift",
    targetIndex: 0
  });
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
  const moveIndex = logSet.indexOf("moveCustomWorkoutCarousel(carousel, nextProgress.current.index");

  assert.ok(savingIndex >= 0 && savingIndex < saveIndex);
  assert.ok(saveIndex < progressIndex && progressIndex < moveIndex);
  assert.match(logSet, /if \(!result\.saved\) \{[\s\S]*?setWorkoutCarouselAutosaveState\(logElement, "issue"\);[\s\S]*?return;/);
});

test("group autosave advances forward with the same smooth deck direction", () => {
  const logSet = sourceForFunction("logCurrentWorkoutCarouselSet");

  assert.match(
    logSet,
    /moveCustomWorkoutCarousel\(carousel, nextProgress\.current\.index, \{[\s\S]*?direction:\s*1[\s\S]*?\}\)/,
  );
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

test("opens the next grouped exercise when the bottom preview card is clicked", () => {
  const render = sourceForFunction("renderCustomWorkoutCarousel");
  const bind = sourceForFunction("bindCustomWorkoutCarousel");

  assert.match(render, /const canOpenNextCard = groupDeckEnabled[\s\S]*?!deckCue\.complete[\s\S]*?deckCue\.targetIndex >= 0/);
  assert.match(render, /groupNextCard\.dataset\.workoutGroupNextIndex = canOpenNextCard \? String\(deckCue\.targetIndex\) : ""/);
  assert.match(render, /groupNextCard\.disabled = !canOpenNextCard/);
  assert.match(render, /`Show \$\{deckCue\.label\}: \$\{deckCue\.name\}`/);
  assert.match(bind, /closest\("\[data-workout-group-next-card\]"\)/);
  assert.match(bind, /groupNextCard\s*\?\s*previewIndex[\s\S]*?const direction = groupNextCard \? 1/);
  assert.match(bind, /groupNextCard && \(groupNextCard\.hasAttribute\("disabled"\)[\s\S]*?previewIndex < 0\)\) return/);
  assert.match(bind, /moveCustomWorkoutCarousel\(carousel, nextIndex, \{ direction \}\)/);
  assert.match(mobileStyles, /\.custom-workout-group-next-card \{[\s\S]*?pointer-events:\s*auto;[\s\S]*?touch-action:\s*manipulation/);
  assert.match(mobileStyles, /\.custom-workout-group-next-card:focus-visible \{[\s\S]*?outline:\s*3px solid/);
});

test("routes preview taps to the represented exercise and ignores a disabled completion preview", () => {
  const listeners = {};
  const moves = [];
  class FakeElement {}
  const list = {
    classList: { contains: () => false },
    addEventListener() {}
  };
  const carousel = {
    dataset: { activeIndex: "1" },
    querySelector(selector) {
      return selector === "[data-custom-workout-list]" ? list : null;
    },
    addEventListener(type, handler) {
      listeners[type] = handler;
    }
  };
  const bind = Function(
    "Element",
    "moveCustomWorkoutCarousel",
    `${sourceForFunction("bindCustomWorkoutCarousel")}; return bindCustomWorkoutCarousel;`
  )(FakeElement, (...args) => moves.push(args));
  const preview = new FakeElement();
  preview.dataset = { workoutGroupNextIndex: "0" };
  preview.closest = (selector) => selector === "[data-workout-group-next-card]" ? preview : null;
  preview.hasAttribute = () => false;

  bind(carousel);
  listeners.click({
    target: preview,
    preventDefault() {},
    stopPropagation() {}
  });

  assert.equal(moves.length, 1);
  assert.equal(moves[0][0], carousel);
  assert.equal(moves[0][1], 0);
  assert.deepEqual(moves[0][2], { direction: 1 });

  preview.hasAttribute = (name) => name === "disabled";
  listeners.click({
    target: preview,
    preventDefault() {},
    stopPropagation() {}
  });
  assert.equal(moves.length, 1);
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
