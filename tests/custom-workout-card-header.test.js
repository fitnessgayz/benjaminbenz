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
  assert.match(mobileStyles, /\.custom-workout-card:not\(\.is-open\) \.custom-workout-collapsed-name \{[\s\S]*?display:\s*-webkit-box !important/);
  assert.match(dashboard, /css\/custom-workout-mobile-fix\.css\?v=exercise-title-font-2/);
});

test("keeps the editable name normal while rendering the collapsed title bold uppercase", () => {
  assert.match(
    mobileStyles,
    /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-editable-title input \{[^}]*font-size:\s*1rem !important;[^}]*font-weight:\s*400 !important;[^}]*letter-spacing:\s*normal;[^}]*text-transform:\s*none;/,
  );
  assert.match(
    mobileStyles,
    /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-collapsed-name \{[\s\S]*?font-size:\s*clamp\([^;]+\)(?:\s*!important)?;[\s\S]*?font-weight:\s*900(?:\s*!important)?;[\s\S]*?line-height:\s*[^;]+;[\s\S]*?text-transform:\s*uppercase;/,
  );

  [customCardMarkup, assignedCardMarkup].forEach((markup) => {
    assert.match(markup, /value="\$\{escapeHtml\(exerciseName\)\}"/);
    assert.doesNotMatch(markup, /toUpperCase\(/);
  });
  assert.match(namePreviewSource, /const rawName = String\(nextName \|\| ""\)/);
  assert.match(namePreviewSource, /collapsedTitle\.textContent = editedName \|\| logElement\.dataset\.exerciseName \|\| "Exercise name"/);
  assert.doesNotMatch(namePreviewSource, /toUpperCase\(/);
});

test("contains long uppercase exercise titles inside the card header", () => {
  assert.match(
    mobileStyles,
    /\.custom-workout-name-field-label,[\s\S]*?\.custom-workout-collapsed-name \{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    mobileStyles,
    /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-collapsed-name \{[\s\S]*?max-height:\s*3\.65rem;[\s\S]*?overflow-wrap:\s*anywhere;[\s\S]*?white-space:\s*normal;[\s\S]*?-webkit-line-clamp:\s*2;/,
  );
  assert.match(
    mobileStyles,
    /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-editable-title input \{[\s\S]*?min-width:\s*0;[\s\S]*?text-overflow:\s*ellipsis !important;/,
  );
});

test("keeps delete and collapse actions together in both workout card headers", () => {
  assert.match(customCardMarkup, /class="custom-workout-card-actions"[\s\S]*?data-delete-exercise[\s\S]*?data-exercise-toggle/);
  assert.match(assignedCardMarkup, /class="custom-workout-card-actions"[\s\S]*?data-delete-exercise[\s\S]*?data-exercise-toggle/);
  assert.match(mobileStyles, /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-card > \.custom-workout-card-summary \{[\s\S]*?padding-right: 10px !important;/);
  assert.match(mobileStyles, /:is\(\.client-workout-panel-custom, \.client-workout-panel-assigned\) \.custom-workout-card-actions \{[\s\S]*?position: absolute;[\s\S]*?top: 10px;[\s\S]*?right: 8px;/);
  assert.match(mobileStyles, /\.custom-workout-card-actions \.custom-workout-delete-icon,[\s\S]*?\.custom-workout-card-actions \.custom-workout-card-toggle \{[\s\S]*?position: static !important;/);
});
