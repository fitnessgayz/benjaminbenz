const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const portalSource = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const styleSource = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = portalSource.indexOf(marker);
  assert.ok(start >= 0, `${name} must exist`);
  const rest = portalSource.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

test("the feedback footer places Skip beside the single completion action", () => {
  const markupSource = functionSource("workoutDifficultyPromptMarkup");
  assert.match(markupSource, /workout-difficulty-bottom-actions/);
  assert.match(markupSource, /data-workout-difficulty-skip>Skip<\/button>/);
  assert.match(markupSource, /data-workout-difficulty-save disabled>Save<\/button>/);
  assert.doesNotMatch(markupSource, /data-workout-difficulty-save disabled>Done<\/button>/);
  assert.doesNotMatch(markupSource, /Save and finish workout/);
  assert.equal((markupSource.match(/data-workout-difficulty-save/g) || []).length, 1);
  assert.match(styleSource, /\.workout-difficulty-bottom-actions\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:/s);
});

test("the finish button enables only after every rating has an answer", () => {
  const buttons = [{ disabled: true }];
  const option = {
    dataset: { workoutDifficultyOption: "3" },
    classList: { toggle() {} },
    setAttribute() {}
  };
  const overlay = {
    querySelectorAll(selector) {
      return selector === "[data-workout-difficulty-option]" ? [option] : buttons;
    }
  };
  const context = vm.createContext({
    pendingWorkoutDifficulty: 3,
    pendingWorkoutEnergy: { before: 2, after: 4 },
    ensureWorkoutDifficultyPrompt: () => overlay
  });
  vm.runInContext(functionSource("renderWorkoutDifficultyPrompt"), context);
  context.renderWorkoutDifficultyPrompt();
  assert.deepEqual(buttons.map((button) => button.disabled), [false]);

  context.pendingWorkoutEnergy.after = null;
  context.renderWorkoutDifficultyPrompt();
  assert.deepEqual(buttons.map((button) => button.disabled), [true]);
});

test("Skip completes without saving an incomplete feedback record", () => {
  assert.match(portalSource, /closeWorkoutDifficultyPrompt\(\{ skipped: true \}\)/);
  assert.match(portalSource, /workoutFeedbackSkipped\s*\?\s*\{ saved: true \}\s*:\s*await saveWorkoutDifficultyFeedback/);
  assert.match(portalSource, /workoutFeedbackSkipped \? null : workoutFeedback\.difficulty/);
});

test("the mobile feedback sheet is shorter and keeps its action header visible", () => {
  assert.match(styleSource, /\.workout-difficulty-sheet\s*\{[^}]*max-height:\s*min\(82dvh, 660px\)/s);
  assert.match(styleSource, /\.workout-difficulty-header\s*\{[^}]*position:\s*sticky/s);
  assert.match(styleSource, /@media \(max-width: 480px\)[\s\S]*?\.workout-difficulty-sheet\s*\{[^}]*max-height:\s*min\(78dvh, 600px\)/);
});
