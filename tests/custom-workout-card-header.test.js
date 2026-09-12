const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const customCardMarkup = portal.slice(
  portal.indexOf("function customWorkoutCardMarkup"),
  portal.indexOf("function customWorkoutListMarkup")
);
const assignedCardMarkup = portal.slice(
  portal.indexOf("function exerciseCard("),
  portal.indexOf("function exerciseCardRows")
);
const namePreviewSource = portal.slice(
  portal.indexOf("function syncExerciseNamePreview"),
  portal.indexOf("function renderExerciseNotesState")
);

test("removes duplicate group badges from both workout card types", () => {
  assert.doesNotMatch(customCardMarkup, /data-custom-workout-format-marker/);
  assert.doesNotMatch(assignedCardMarkup, /data-assigned-workout-format-marker/);
  assert.doesNotMatch(assignedCardMarkup, /class="custom-workout-card-marker-row"/);
});

test("labels and collapses the exercise-name editor on both workout card types", () => {
  [customCardMarkup, assignedCardMarkup].forEach((markup) => {
    const labelIndex = markup.indexOf('class="custom-workout-name-field-label"');
    const editorIndex = markup.indexOf('class="custom-workout-editable-title"');

    assert.ok(labelIndex >= 0 && labelIndex < editorIndex);
    assert.match(markup, />Exercise name<\/span>/);
    assert.match(markup, /data-exercise-collapsed-name/);
    assert.match(markup, /data-exercise-toggle[\s\S]*?aria-expanded=/);
  });

  assert.match(namePreviewSource, /data-exercise-collapsed-name/);
  assert.match(namePreviewSource, /collapsedTitle\.textContent = editedName \|\| logElement\.dataset\.exerciseName \|\| "Exercise name"/);
  assert.match(namePreviewSource, /function setWorkoutExerciseCardExpanded[\s\S]*?classList\.toggle\("is-open", isExpanded\)[\s\S]*?setAttribute\("aria-expanded"/);
  assert.match(mobileStyles, /\.custom-workout-name-field-label[\s\S]*?text-transform:\s*uppercase/);
  assert.match(mobileStyles, /\.custom-workout-card:not\(\.is-open\) \.custom-workout-editable-title[\s\S]*?display:\s*none !important/);
  assert.match(mobileStyles, /\.custom-workout-card:not\(\.is-open\) \.custom-workout-collapsed-name \{[\s\S]*?display:\s*flex !important/);
  assert.match(dashboard, /css\/custom-workout-mobile-fix\.css\?v=custom-exercise-deck-1/);
});

test("keeps delete and collapse actions together in both workout card headers", () => {
  assert.match(customCardMarkup, /class="custom-workout-card-actions"[\s\S]*?data-delete-exercise[\s\S]*?data-exercise-toggle/);
  assert.match(assignedCardMarkup, /class="custom-workout-card-actions"[\s\S]*?data-delete-exercise[\s\S]*?data-exercise-toggle/);
  assert.match(mobileStyles, /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-card > \.custom-workout-card-summary \{[\s\S]*?padding-right: 10px !important;/);
  assert.match(mobileStyles, /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-card-actions \{[\s\S]*?position: absolute;[\s\S]*?top: 10px;[\s\S]*?right: 8px;/);
  assert.match(mobileStyles, /\.custom-workout-card-actions \.custom-workout-delete-icon,[\s\S]*?\.custom-workout-card-actions \.custom-workout-card-toggle \{[\s\S]*?position: static !important;/);
});
