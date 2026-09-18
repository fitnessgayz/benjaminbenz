const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("uses the grouped visual hierarchy for custom and assigned straight-set cards", () => {
  const exerciseLog = sourceForFunction("exerciseLogFields");
  const customCard = sourceForFunction("customWorkoutCardMarkup");
  const assignedCard = sourceForFunction("exerciseCard");

  assert.match(customCard, /Straight Set \$\{index \+ 1\}/);
  assert.match(assignedCard, /Straight Set \$\{exerciseIndex \+ 1\}/);
  assert.match(customCard, /straightSetLayout: cardFormat === "single"/);
  assert.match(assignedCard, /straightSetLayout: format === "single"/);
  assert.match(exerciseLog, /data-straight-set-layout="true"/);
  assert.match(exerciseLog, /class="set-table-actions straight-set-stepper"/);
  assert.match(exerciseLog, /<span>Sets<\/span>/);
  assert.match(exerciseLog, /data-straight-set-count/);
  assert.match(exerciseLog, /data-finish-set>Exercise Finished/);

  assert.match(mobileStyles, /\.straight-set-card-label[\s\S]*?text-transform:\s*uppercase/);
  assert.match(mobileStyles, /\[data-straight-set-layout="true"\] \.set-row::before[\s\S]*?content:\s*"SET " attr\(data-set-number\)/);
  assert.match(mobileStyles, /\.set-row\.is-warm-up::before[\s\S]*?EXCLUDED FROM WORKING VOLUME/);
  assert.match(mobileStyles, /\.straight-set-stepper[\s\S]*?grid-template-columns:\s*62px minmax\(0, 1fr\) 62px/);
});

test("logs one active straight set at a time and saves before advancing", () => {
  const rowMarkup = sourceForFunction("setRowMarkup");
  const syncButtons = sourceForFunction("syncStraightSetLogButtons");
  const interactions = sourceForFunction("handleWorkoutInteractions");
  const loggedCheck = sourceForFunction("isSetRowLogged");
  const visibleTarget = sourceForFunction("visibleSetTarget");

  assert.match(rowMarkup, /data-straight-set-log/);
  assert.match(rowMarkup, />\$\{options\.straightSetLayout \? "Log Set" : "✓"\}<\/span>/);
  assert.match(syncButtons, /rows\.find\(\(row\) => !row\.classList\.contains\("is-complete"\)\)/);
  assert.match(syncButtons, /button\.hidden = !active/);
  assert.match(interactions, /matches\("\[data-straight-set-log\]"\)/);
  assert.match(interactions, /straightSetRowHasEntry\(setRow\)/);
  assert.match(interactions, /await saveTrainingLogRows\(completeSetButton, \[logElement\], status/);
  assert.match(interactions, /if \(!saveResult\.saved\)[\s\S]*?classList\.remove\("is-complete"\)/);
  assert.match(interactions, /nextLogButton = logElement\.querySelector\("\[data-straight-set-log\]:not\(\[hidden\]\)"\)/);
  assert.match(loggedCheck, /closest\("\[data-straight-set-layout='true'\]"\)/);
  assert.match(visibleTarget, /dataset\.straightSetLayout === "true"[\s\S]*?return rowCount/);
  assert.match(interactions, /isStraightSetLayout \? workingSetRows\.length <= 1 : setRows\.length <= 1/);
  assert.match(mobileStyles, /\.straight-set-log-button[\s\S]*?background:\s*#cbff31/);
});

test("straight-set entry validation preserves exact zero values", () => {
  const inputValuesSource = sourceForFunction("setRowInputValues");
  const entrySource = sourceForFunction("straightSetRowHasEntry");
  const hasEntry = Function(
    `${inputValuesSource}; ${entrySource}; return straightSetRowHasEntry;`
  )();
  const row = (weight, reps) => ({
    querySelector(selector) {
      if (selector === "[data-set-weight]") return { value: weight };
      if (selector === "[data-set-reps]") return { value: reps };
      return null;
    }
  });

  assert.equal(hasEntry(row("0", "")), true);
  assert.equal(hasEntry(row("", "0")), true);
  assert.equal(hasEntry(row("0", "0")), true);
  assert.equal(hasEntry(row("", "")), false);
  assert.match(entrySource, /weightValue >= 0/);
  assert.match(entrySource, /repsValue >= 0/);
  assert.match(portal, /Zero is allowed\./);
});

test("loads the updated straight-set layout assets", () => {
  assert.match(dashboard, /custom-workout-mobile-fix\.css\?v=straight-set-layout-1/);
  assert.match(dashboard, /client-portal\.js\?v=straight-set-layout-1/);
});
