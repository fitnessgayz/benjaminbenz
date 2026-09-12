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

test("renders a distinct bottom add card that stays out of exercise counts", () => {
  const markup = sourceForFunction("customWorkoutCarouselGroupMarkup");
  const cards = sourceForFunction("customWorkoutCarouselCards");

  assert.match(markup, /format === "single"/);
  assert.match(markup, /data-custom-workout-new-exercise="\$\{nextExerciseNumber\}"/);
  assert.match(markup, /aria-label="Add new exercise \$\{nextExerciseNumber\}"/);
  assert.match(markup, /\+ New exercise \$\{nextExerciseNumber\}/);
  assert.match(markup, /Input exercise name here/);
  assert.match(markup, /data-custom-workout-exercise-deck[\s\S]*?data-custom-workout-list[\s\S]*?\$\{newExerciseCard\}/);
  assert.match(cards, /element\.matches\("\[data-custom-exercise-card\]"\)/);
  assert.doesNotMatch(cards, /data-custom-workout-new-exercise/);
});

test("enables the lifted deck for straight custom and grouped mobile workouts", () => {
  const render = sourceForFunction("renderCustomWorkoutCarousel");

  assert.match(render, /const straightDeckEnabled = mobile && isCustomPanel && format === "single" && cards\.length > 0/);
  assert.match(render, /const groupDeckEnabled = mobile && format !== "single" && cards\.length > 1/);
  assert.match(render, /const deckEnabled = straightDeckEnabled \|\| groupDeckEnabled/);
  assert.match(render, /const canAddExercise = straightDeckEnabled/);
  assert.match(render, /carousel\.dataset\.customWorkoutDeck = deckEnabled \? "true" : "false"/);
  assert.match(render, /carousel\.dataset\.groupWorkoutDeck = groupDeckEnabled \? "true" : "false"/);
  assert.match(render, /carousel\.dataset\.customWorkoutCanAddExercise = canAddExercise \? "true" : "false"/);
  assert.match(render, /panel\.dataset\.customWorkoutDeckEnabled = straightDeckEnabled \? "true" : "false"/);
  assert.match(render, /progressHeader\.hidden = !groupProgressEnabled \|\| groupDeckEnabled/);
  assert.match(render, /newExerciseCard\.hidden = !canAddExercise/);
  assert.match(render, /querySelectorAll\("\[data-custom-exercise-card\]"\)\.length \|\| cards\.length\) \+ 1/);
});

test("moves normally and treats forward navigation past the last card as add", () => {
  const decisionSource = sourceForFunction("customWorkoutCarouselNavigationDecision");
  const decision = Function(`${decisionSource}; return customWorkoutCarouselNavigationDecision;`)();

  assert.deepEqual(decision(2, 3, true), { action: "move", index: 2 });
  assert.deepEqual(decision(3, 3, true), { action: "add", index: 3 });
  assert.deepEqual(decision(1, 3, true), { action: "move", index: 1 });
  assert.deepEqual(decision(-1, 3, true), { action: "move", index: 0 });
  assert.deepEqual(decision(3, 3, false), { action: "move", index: 2 });
  assert.deepEqual(decision(3, 3, false, true), { action: "move", index: 0 });
  assert.deepEqual(decision(-1, 3, false, true), { action: "move", index: 2 });
});

test("tap, next arrow, and final left swipe share the guarded add path", () => {
  const request = sourceForFunction("requestCustomWorkoutNewExercise");
  const move = sourceForFunction("moveCustomWorkoutCarousel");
  const bind = sourceForFunction("bindCustomWorkoutCarousel");
  const interactionStart = portal.indexOf("if (addCustomExerciseButton) {");
  const interactionEnd = portal.indexOf("if (addAssignedExerciseButton) {", interactionStart);
  const interaction = portal.slice(interactionStart, interactionEnd);

  assert.match(request, /addCard\.click\(\)/);
  assert.match(move, /customWorkoutCanAddExercise === "true"/);
  assert.match(move, /decision\.action === "add"[\s\S]*?requestCustomWorkoutNewExercise\(carousel\)/);
  assert.match(bind, /moveCustomWorkoutCarousel\(carousel, startIndex \+ direction\)/);
  assert.match(bind, /input, select, textarea, button, a/);
  assert.match(interaction, /customWorkoutNewExercisePending === "true"/);
  assert.match(interaction, /expectedExerciseNumber !== nextExerciseNumber/);
  assert.match(interaction, /customWorkoutNewExercisePending = "true"/);
  assert.match(interaction, /classList\.add\("is-entering-deck"\)/);
  assert.match(interaction, /persistCustomWorkoutDraftFromPanel\(panel\)/);
});

test("keeps only the active real card interactive and clears the mobile dock", () => {
  const render = sourceForFunction("renderCustomWorkoutCarousel");
  const bind = sourceForFunction("bindCustomWorkoutCarousel");
  const move = sourceForFunction("moveCustomWorkoutCarousel");

  assert.match(render, /card\.inert = isHiddenSlide/);
  assert.match(render, /card\.setAttribute\("aria-hidden", "true"\)/);
  assert.match(render, /card\.removeAttribute\("aria-hidden"\)/);
  assert.match(
    render,
    /addsExercise[\s\S]*?\? `Add new exercise \$\{cards\.length \+ 1\}`[\s\S]*?: format === "circuit" \? "Next station" : "Next exercise"/,
  );
  assert.match(bind, /carousel\.dataset\.customWorkoutDeck === "true"/);
  assert.match(move, /is-deck-entering-forward/);
  assert.match(move, /is-deck-entering-backward/);
  assert.match(mobileStyles, /data-custom-workout-deck-enabled="true"[\s\S]*?\.custom-workout-add-actions \{[\s\S]*?display: none;/);
  assert.match(mobileStyles, /\.custom-workout-card:not\(\.is-carousel-active\) \{[\s\S]*?display: none !important;/);
  assert.match(mobileStyles, /\.custom-workout-card\.is-exercise-complete \{[\s\S]*?border-color: #21a637 !important;[\s\S]*?background: #f5faf4 !important;/);
  assert.match(mobileStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none !important;/);
});

test("maps horizontal touch distance to bounded deck drag motion", () => {
  const metricsSource = sourceForFunction("customWorkoutDeckDragMetrics");
  const metricsFor = Function(`${metricsSource}; return customWorkoutDeckDragMetrics;`)();

  assert.deepEqual(metricsFor(0, 320), {
    x: 0,
    rotate: 0,
    opacity: 1
  });
  assert.deepEqual(metricsFor(32, 320), {
    x: 32,
    rotate: 0.24,
    opacity: 0.976
  });
  assert.deepEqual(metricsFor(-32, 320), {
    x: -32,
    rotate: -0.24,
    opacity: 0.976
  });
  assert.deepEqual(metricsFor(1000, 320), metricsFor(320, 320));
  assert.deepEqual(metricsFor(-1000, 320), metricsFor(-320, 320));
});

test("uses CSS variables for finger-following and settles before moving the deck", () => {
  const bind = sourceForFunction("bindCustomWorkoutCarousel");
  const applyDrag = sourceForFunction("applyCustomWorkoutDeckDrag");
  const applyExit = sourceForFunction("applyCustomWorkoutDeckExit");
  const move = sourceForFunction("moveCustomWorkoutCarousel");

  assert.match(bind, /applyCustomWorkoutDeckDrag\(list, resistedDeltaX\)/);
  assert.match(applyDrag, /customWorkoutDeckDragMetrics\(deltaX, list\?\.clientWidth\)/);
  assert.match(applyDrag, /--custom-workout-deck-drag-x/);
  assert.match(applyDrag, /--custom-workout-deck-drag-rotate/);
  assert.match(applyDrag, /--custom-workout-deck-drag-opacity/);
  assert.match(bind, /if \(!touchSwipe\.visualDeck\) \{[\s\S]*?list\.scrollLeft = touchSwipe\.startScrollLeft - deltaX;[\s\S]*?return;[\s\S]*?applyCustomWorkoutDeckDrag\(list, resistedDeltaX\)/);
  assert.match(bind, /classList\.add\("is-touch-swiping"\)/);
  assert.match(bind, /classList\.add\("is-deck-settling"\)/);
  assert.match(bind, /moveCustomWorkoutCarousel\(carousel, startIndex \+ direction,[\s\S]*?direction/);
  assert.match(move, /function moveCustomWorkoutCarousel\(carousel, nextIndex, options = \{\}\)/);
  assert.match(move, /options\.instant/);
  assert.match(move, /options\.direction/);
  assert.match(bind, /activeCard\?\.classList\.remove\([\s\S]*?"is-deck-entering-forward"[\s\S]*?"is-deck-entering-backward"/);
  assert.match(bind, /delete activeCard\.dataset\.deckAnimationToken/);
  assert.match(bind, /event\.touches\.length !== 1[\s\S]*?clearCustomWorkoutDeckDrag\(list\)/);
  assert.match(bind, /classList\.contains\("is-deck-settling"\)[\s\S]*?return/);
  assert.match(applyExit, /clientWidth[\s\S]*?\+ 32/);
  assert.match(applyExit, /--custom-workout-deck-drag-opacity", "0"/);
  assert.match(bind, /addEventListener\("transitionend", finishExit/);
  assert.match(bind, /event\.target !== activeCard \|\| event\.propertyName !== "transform"/);
  assert.match(bind, /window\.setTimeout\(finishExit, 240\)/);
});

test("uses a smooth 320ms entrance with an instant and reduced-motion escape hatch", () => {
  const move = sourceForFunction("moveCustomWorkoutCarousel");

  assert.match(mobileStyles, /\.custom-workout-card\.is-deck-entering-forward \{[\s\S]*?animation:\s*custom-workout-deck-enter-forward 320ms cubic-bezier\(/);
  assert.match(mobileStyles, /\.custom-workout-card\.is-deck-entering-backward \{[\s\S]*?animation:\s*custom-workout-deck-enter-backward 320ms cubic-bezier\(/);
  assert.match(move, /const instant = Boolean\(options\.instant\)/);
  assert.match(move, /prefers-reduced-motion:\s*reduce/);
  assert.match(move, /!instant[\s\S]*?!reducedMotion[\s\S]*?isVisualDeck/);
  assert.match(move, /window\.setTimeout\([\s\S]*?360\)/);
  assert.match(
    mobileStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.is-touch-swiping[\s\S]*?\.is-deck-settling[\s\S]*?transition:\s*none !important;[\s\S]*?animation:\s*none !important;/,
  );
});

test("rebuilds when switching between grouped cards and the straight-set add card", () => {
  const regroup = sourceForFunction("regroupCustomWorkoutCarousels");
  const formatUpdate = sourceForFunction("updateCustomWorkoutFormat");

  assert.match(regroup, /hasExpectedNewExerciseCards/);
  assert.match(regroup, /Boolean\(carousel\.querySelector\("\[data-custom-workout-new-exercise\]"\)\) === \(format === "single"\)/);
  assert.match(regroup, /const alreadyGrouped = hasExpectedNewExerciseCards &&/);
  assert.match(formatUpdate, /\[data-custom-workout-add-actions\] \[data-add-custom-exercise\]/);
});
