const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const start = match.index;
  const next = source.slice(start + match[0].length).search(/\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/);
  assert.ok(next >= 0, `${name} has a following declaration`);
  return source.slice(start, start + match[0].length + next);
}

function groupedToggleFixture({ saveResult = { saved: true }, warmUp = true } = {}) {
  const states = new Set();
  const canonical = { classList: { contains: (name) => states.has(name) }, dataset: {} };
  const panel = { dataset: { customWorkoutTitle: "Custom Workout" }, querySelector: () => ({ value: "2026-10-29" }) };
  const section = { dataset: { customGroupedRound: warmUp ? "0" : "1" } };
  const visible = {
    dataset: { customGroupedSetType: warmUp ? "warm_up" : "working", customGroupedExerciseIndex: "0", customGroupedSetNumber: "1" },
    closest: () => section
  };
  const carousel = { dataset: {}, closest: () => panel, querySelector: () => ({}), querySelectorAll: () => [] };
  const button = { disabled: false, closest: (selector) => selector === ".custom-workout-grouped-row" ? visible : carousel };
  const status = { textContent: "" };
  const calls = { saved: 0, options: null, copied: 0, rest: 0 };
  const toggle = Function("deps", `
    const { canonical, carousel, panel, status, calls, states } = deps;
    const warmUpSetType = "warm_up", customWorkoutTitle = "Custom Workout";
    const workoutElapsedTimerState = { running: true };
    const customWorkoutGroupedCanonicalRow = () => canonical;
    const customWorkoutGroupedStatus = () => status;
    const setCustomWorkoutGroupedRowComplete = (_row, complete) => complete ? states.add("is-complete") : states.delete("is-complete");
    const persistCustomWorkoutDraftForElement = () => {};
    const refreshCustomWorkoutGroupedCompletion = () => {};
    const requireWorkoutGymLocation = () => true;
    const customWorkoutGroupedTimerConflict = () => false;
    const validateCustomWorkoutGroupedExerciseNames = () => true;
    const validateCustomWorkoutGroupedSection = () => ({ valid: true });
    const customWorkoutGroupedLogElements = () => [{}];
    const saveTrainingLogRows = async (_button, _logs, _status, options) => {
      calls.saved++;
      calls.options = options;
      return deps.saveResult;
    };
    const autoCopyCustomWorkoutGroupedNextRound = () => { calls.copied++; };
    const startWorkoutElapsedTimer = () => {};
    const customWorkoutGroupedRoundIsLogged = () => true;
    const renderCustomWorkoutGroupedCard = () => {};
    const autoRestTimerEnabled = () => true;
    const workoutCarouselRestSeconds = () => 60;
    const setRestTimerDuration = () => {};
    const resetRestTimer = () => {};
    const startOrPauseRestTimer = () => { calls.rest++; };
    const renderCustomWorkoutGroupedRestControls = () => {};
    const todayDate = () => "2026-10-29";
    const document = { querySelectorAll: () => [panel] };
    ${functionSource("toggleCustomWorkoutGroupedSet")}
    return toggleCustomWorkoutGroupedSet;
  `)({ canonical, carousel, panel, status, calls, states, saveResult });
  return { toggle, button, canonical, carousel, status, calls };
}

test("grouped warm-up Log box saves only warm-up rows without copying next working round or starting rest", async () => {
  const fixture = groupedToggleFixture();
  const result = await fixture.toggle(fixture.button);
  assert.equal(result.saved, true);
  assert.equal(fixture.calls.saved, 1);
  assert.equal(fixture.calls.options.setType, "warm_up");
  assert.equal(fixture.calls.options.skipRemovedSetDelete, true);
  assert.equal(fixture.calls.copied, 0);
  assert.equal(fixture.calls.rest, 0);
  assert.equal(fixture.canonical.classList.contains("is-complete"), true);
});

test("failed grouped warm-up save keeps values available and returns Log box to unlogged state", async () => {
  const fixture = groupedToggleFixture({ saveResult: { saved: false } });
  const result = await fixture.toggle(fixture.button);
  assert.equal(result.saved, false);
  assert.equal(fixture.canonical.classList.contains("is-complete"), false);
  assert.equal(fixture.carousel.dataset.customGroupedRowSaving, undefined);
  assert.equal(fixture.button.disabled, false);
});

test("grouped warm-up and round rows use one Log box and retain rest controls", () => {
  const sections = functionSource("customWorkoutGroupedSectionsMarkup");
  const row = functionSource("customWorkoutGroupedSetRowMarkup");
  assert.match(sections, /<h4>Warm-up<\/h4>/);
  assert.match(sections, /<span>Set<\/span><span>Weight<\/span><span>Reps<\/span><span>Log<\/span>/);
  assert.match(sections, /data-custom-grouped-rest-toggle/);
  assert.match(row, /data-custom-grouped-set-toggle/);
  assert.doesNotMatch(sections, /data-custom-grouped-(?:skip-warmup|log-warmup|log-round)/);
});
