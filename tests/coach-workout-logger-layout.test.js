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

test("matches the custom workout card per-set controls and actions", () => {
  const exerciseMarkup = loggerScript.slice(
    loggerScript.indexOf("function coachWorkoutSetMarkup"),
    loggerScript.indexOf("function coachWorkoutExerciseElements")
  );
  const setIndex = exerciseMarkup.indexOf("data-coach-workout-set-row");
  const weightIndex = exerciseMarkup.indexOf("data-coach-workout-weight");
  const repsIndex = exerciseMarkup.indexOf("data-coach-workout-reps");
  const rirIndex = exerciseMarkup.indexOf("data-coach-workout-rir");

  assert.match(exerciseMarkup, /Input exercise name here/);
  assert.match(exerciseMarkup, /coach-workout-remove-exercise[\s\S]*?<svg/);
  assert.ok(setIndex >= 0 && weightIndex > setIndex && repsIndex > weightIndex && rirIndex > repsIndex);
  assert.match(exerciseMarkup, /data-coach-workout-add-set/);
  assert.match(exerciseMarkup, /data-coach-workout-delete-set/);
  assert.match(exerciseMarkup, /data-coach-workout-add-superset/);
  assert.match(exerciseMarkup, /data-coach-workout-notes-toggle/);
  assert.match(styles, /\.coach-workout-set-header,[\s\S]*?grid-template-columns:\s*54px minmax\(0, 1fr\) minmax\(0, 1fr\) 72px/);
});

test("uses a carousel for superset and circuit while straight sets stay stacked", () => {
  assert.match(styles, /\.coach-workout-carousel\[data-coach-workout-format="superset"\],[\s\S]*?\.coach-workout-carousel\[data-coach-workout-format="circuit"\]/);
  assert.match(styles, /\.coach-workout-carousel\[data-carousel-enabled="true"\] \.coach-workout-exercise-list[\s\S]*?scroll-snap-type:\s*x mandatory/);
  assert.match(loggerScript, /const enabled = format !== "single" && exercises\.length > 1/);
  assert.match(loggerScript, /data-coach-workout-dot/);
  assert.match(loggerScript, /data-coach-workout-previous/);
  assert.match(loggerScript, /data-coach-workout-next/);
});

test("saves each set's weight reps and optional RIR", () => {
  assert.match(loggerScript, /weight_used:\s*set\.weight/);
  assert.match(loggerScript, /reps:\s*set\.reps/);
  assert.match(loggerScript, /effort_scale:\s*set\.rir === null \? null : "rir"/);
  assert.match(loggerScript, /effort_value:\s*set\.rir/);
});

test("filters the exercise library into a scrollable name dropdown", () => {
  assert.match(loggerScript, /role="combobox"/);
  assert.match(loggerScript, /data-coach-workout-suggestions/);
  assert.match(loggerScript, /data-coach-workout-suggestion=/);
  assert.match(loggerScript, /\.filter\(\(item\) => item\.is_active !== false/);
  assert.match(loggerScript, /\.slice\(0, 16\)/);
  assert.match(styles, /\.coach-workout-suggestion-menu\s*\{[\s\S]*?max-height:\s*190px[\s\S]*?overflow-y:\s*auto/);
});
