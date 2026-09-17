const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");

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

  for (let index = bodyStart; index < portal.length; index += 1) {
    const character = portal[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote && quote !== "`") quote = "";
      else if (character === "`" && quote === "`") quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) return portal.slice(start, index + 1);
    }
  }

  throw new Error(`Could not read ${name}`);
}

test("assigned supersets and circuits use the grouped round projection without padding prescriptions", () => {
  const assigned = sourceForFunction("assignedWorkoutCarouselMarkup");
  const render = sourceForFunction("renderCustomWorkoutGroupedCard");
  const logged = sourceForFunction("customWorkoutGroupedRoundIsLogged");

  assert.match(assigned, /customWorkoutGroupedRoundCardMarkup/);
  assert.match(assigned, /source: "assigned"/);
  assert.match(assigned, /normalizeRounds: false/);
  assert.match(assigned, /showSessionControls: false/);
  assert.match(render, /customWorkoutNormalizeRounds !== "false"/);
  assert.match(logged, /filter\(Boolean\)/);
  assert.match(logged, /rows\.length > 0 && rows\.every/);
  assert.doesNotMatch(logged, /rows\.length === customWorkoutGroupedLogElements/);
});

test("assigned round validation remains permissive while custom grouped validation stays strict", () => {
  const markup = sourceForFunction("customWorkoutGroupedRoundCardMarkup");
  const validate = sourceForFunction("validateCustomWorkoutGroupedSection");
  const logRound = sourceForFunction("logCustomWorkoutGroupedRound");

  assert.match(markup, /data-custom-workout-validation="\$\{source === "assigned" \? "assigned" : "strict"\}"/);
  assert.match(validate, /assignedPolicy/);
  assert.match(validate, /const hasEntry = hasWeight \|\| hasReps/);
  assert.match(validate, /RIR is optional/);
  assert.match(validate, /Enter weight \(0 is allowed\), reps above 0, and RIR from 0 to 5/);
  assert.match(logRound, /source === "assigned"[\s\S]*?openRestTimer\(button\)/);
  assert.match(logRound, /source === "custom"[\s\S]*?startWorkoutElapsedTimer/);
});

test("custom and assigned straight sets stay full-width without changing their canonical save controls", () => {
  const customGroup = sourceForFunction("customWorkoutCarouselGroupMarkup");
  const assignedStraight = sourceForFunction("straightSetRows");
  const render = sourceForFunction("renderCustomWorkoutCarousel");

  assert.match(customGroup, /unified-straight-workout/);
  assert.match(customGroup, /data-workout-logger-layout="unified"/);
  assert.match(assignedStraight, /\.map\(\(exercise, index\)/);
  assert.match(assignedStraight, /data-workout-logger-layout="unified"/);
  assert.match(assignedStraight, /exerciseCard\(exercise, workoutTitle, true/);
  assert.match(render, /const straightDeckEnabled = false/);
  assert.match(styles, /\[data-workout-logger-layout="unified"\][\s\S]*?\.custom-workout-card \{[\s\S]*?width: 100% !important/);
  assert.match(styles, /\[data-workout-logger-layout="unified"\] \.set-header \{[\s\S]*?display: none !important/);
  assert.match(styles, /\.set-input-field em,[\s\S]*?\.set-rir-button span[\s\S]*?display: block !important/);
  assert.match(styles, /\.set-row\.is-warm-up[\s\S]*?border-left-color: var\(--unified-gold\)/);
  assert.match(styles, /\.set-row \{[\s\S]*?border-left: 5px solid var\(--unified-blue\)/);
});

test("assigned add and delete paths preserve the unified wrappers", () => {
  const interactions = sourceForFunction("handleWorkoutInteractions");
  const remove = sourceForFunction("removeExerciseLog");

  assert.match(interactions, /format === "single"[\s\S]*?unified-straight-workout client-added-workout-group/);
  assert.match(interactions, /format === "circuit"[\s\S]*?assignedWorkoutCarouselMarkup\(\[\], workoutTitle/);
  assert.match(remove, /straightGroup\.remove\(\)/);
  assert.match(remove, /customWorkoutCarouselCards\(groupedCarousel\)\.length === 0/);
});

test("group editors receive unique instance-scoped control ids", () => {
  const markup = sourceForFunction("customWorkoutGroupedRoundCardMarkup");
  const editor = sourceForFunction("customWorkoutGroupNameEditorMarkup");
  const sync = sourceForFunction("syncCustomWorkoutGroupNameEditor");

  assert.match(portal, /let groupedWorkoutMarkupSequence = 0/);
  assert.match(markup, /const idScope = `\$\{source\}-\$\{\+\+groupedWorkoutMarkupSequence\}`/);
  assert.match(markup, /data-custom-workout-id-scope="\$\{idScope\}"/);
  assert.match(editor, /options\.idScope/);
  assert.match(sync, /carousel\.dataset\.customWorkoutIdScope/);
});

test("dashboard cache keys deliver the unified client layout", () => {
  assert.match(dashboard, /custom-workout-mobile-fix\.css\?v=unified-workout-layout-1/);
  assert.match(dashboard, /client-portal\.js\?v=unified-workout-layout-1/);
});
