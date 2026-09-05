const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");
const customCardMarkup = portal.slice(
  portal.indexOf("function customWorkoutCardMarkup"),
  portal.indexOf("function customWorkoutListMarkup")
);
const assignedCardMarkup = portal.slice(
  portal.indexOf("function exerciseCard("),
  portal.indexOf("function exerciseCardRows")
);

test("removes only the duplicate Custom Workout group badge", () => {
  assert.doesNotMatch(customCardMarkup, /data-custom-workout-format-marker/);
  assert.match(assignedCardMarkup, /data-assigned-workout-format-marker/);
});

test("keeps delete and collapse actions together in the custom card header", () => {
  assert.match(customCardMarkup, /class="custom-workout-card-actions"[\s\S]*?data-delete-exercise[\s\S]*?data-exercise-toggle/);
  assert.match(mobileStyles, /\.client-workout-panel-custom \.custom-workout-card > \.custom-workout-card-summary \{[\s\S]*?padding-right: 98px !important;/);
  assert.match(mobileStyles, /\.client-workout-panel-custom \.custom-workout-card-actions \{[\s\S]*?position: absolute;[\s\S]*?top: 10px;[\s\S]*?right: 8px;/);
  assert.match(mobileStyles, /\.custom-workout-card-actions \.custom-workout-delete-icon,[\s\S]*?\.custom-workout-card-actions \.custom-workout-card-toggle \{[\s\S]*?position: static !important;/);
});
