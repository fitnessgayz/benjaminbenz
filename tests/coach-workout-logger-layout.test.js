const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const loggerScript = fs.readFileSync(path.join(root, "js/coach-workout-log.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

test("places Session logger immediately after Clients", () => {
  const clientsIndex = adminHtml.indexOf('data-admin-tab="clients"');
  const loggerIndex = adminHtml.indexOf('href="coach-workout-log.html"');
  const profileIndex = adminHtml.indexOf('data-admin-tab="profile"');

  assert.ok(clientsIndex >= 0);
  assert.ok(loggerIndex > clientsIndex);
  assert.ok(profileIndex > loggerIndex);
});

test("matches the custom workout card field order and actions", () => {
  const exerciseMarkup = loggerScript.slice(
    loggerScript.indexOf("function coachWorkoutExerciseMarkup"),
    loggerScript.indexOf("function renumberCoachWorkoutExercises")
  );
  const setsIndex = exerciseMarkup.indexOf("data-coach-workout-sets");
  const weightIndex = exerciseMarkup.indexOf("data-coach-workout-weight");
  const repsIndex = exerciseMarkup.indexOf("data-coach-workout-reps");

  assert.match(exerciseMarkup, /Input exercise name here/);
  assert.match(exerciseMarkup, /coach-workout-remove-exercise[\s\S]*?<svg/);
  assert.ok(setsIndex >= 0 && weightIndex > setsIndex && repsIndex > weightIndex);
  assert.match(styles, /\.coach-workout-exercise-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(72px, \.45fr\) minmax\(120px, 1fr\) minmax\(120px, 1fr\)/);
});
