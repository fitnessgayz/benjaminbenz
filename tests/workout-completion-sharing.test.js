const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");

test("shows the approved workout completion share prompt after a successful finish", () => {
  assert.match(portal, /openWorkoutCompletionSharePrompt\(\s*workoutCompletionShareSummary\(saveResult\.rows, workoutCompletion, workoutDifficulty\)/);
  assert.match(portal, /handleWorkoutCompletionSharePrompt\(\);/);
  assert.match(portal, /data-workout-share>Share workout</);
  assert.match(portal, /data-workout-share-dismiss>Not now</);
});

test("shares today's workout without volume or set totals", () => {
  const markupStart = portal.indexOf("function workoutCompletionSharePromptMarkup");
  const markupEnd = portal.indexOf("function ensureWorkoutCompletionSharePrompt", markupStart);
  const markup = portal.slice(markupStart, markupEnd);

  assert.match(markup, /data-workout-share-duration/);
  assert.match(markup, /data-workout-share-exercises/);
  assert.match(markup, /data-workout-share-week/);
  assert.match(markup, /Exercises completed/);
  assert.doesNotMatch(markup, /Working sets|Total volume/i);
});

test("counts completed workouts for the current Monday-to-Sunday week", () => {
  assert.match(portal, /function completedWorkoutCountForWeek\(/);
  assert.match(portal, /const range = clientHomeWeekRange\(entryDate\)/);
  assert.match(portal, /filter\(\(record\) => String\(record\?\.completed_at \|\| ""\)\.trim\(\)\)/);
  assert.match(portal, /weeklyWorkoutCount: completedWorkoutCountForWeek\(entryDate\)/);
  assert.match(portal, /workout\$\{summary\.weeklyWorkoutCount === 1 \? "" : "s"\} this week/);
});

test("generates an image and opens the native share menu with a clipboard fallback", () => {
  assert.match(portal, /canvas\.width = 1080/);
  assert.match(portal, /canvas\.height = 1350/);
  assert.match(portal, /EXERCISES COMPLETED/);
  assert.match(portal, /navigator\.share\(shareData\)/);
  assert.match(portal, /navigator\.clipboard\?\.writeText/);
});

test("keeps the completion sheet and share card mobile-safe", () => {
  assert.match(styles, /\.workout-completion-share-overlay/);
  assert.match(styles, /\.workout-completion-share-sheet[\s\S]*?max-height: min\(94dvh, 820px\)/);
  assert.match(styles, /\.workout-completion-share-metrics[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 380px\)[\s\S]*?\.workout-completion-share-exercises ul[\s\S]*?grid-template-columns: 1fr/);
  const broadMobileControls = styles.indexOf(".dashboard-page :where(input, select, textarea, button");
  const completionHeaderFix = styles.lastIndexOf("body.client-dashboard-page .workout-completion-share-heading > button");

  assert.ok(completionHeaderFix > broadMobileControls, "The completion header fix must follow the broad mobile button rule");
  assert.match(styles.slice(completionHeaderFix), /width: 44px !important/);
  assert.match(styles.slice(completionHeaderFix), /max-width: 44px !important/);
  assert.match(styles, /body\.client-dashboard-page \.workout-completion-share-heading > div[\s\S]*?flex: 1 1 auto[\s\S]*?min-width: 0/);
  assert.match(styles, /body\.client-dashboard-page \.workout-completion-share-heading :is\(small, strong\)[\s\S]*?overflow-wrap: normal !important/);
  assert.match(dashboard, /style\.css\?v=client-notification-settings-1/);
  assert.match(dashboard, /client-portal\.js\?v=grouped-round-controls-1/);
});
