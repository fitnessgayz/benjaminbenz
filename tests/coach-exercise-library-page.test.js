const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const adminHtml = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const libraryHtml = fs.readFileSync(path.join(root, "coach-exercise-library.html"), "utf8");
const adminSource = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "coach.webmanifest"), "utf8"));

test("exercise library opens as a focused coach tool like the workout logger", () => {
  assert.match(adminHtml, /href="coach-exercise-library\.html"[^>]*aria-label="Exercise library"/);
  assert.doesNotMatch(adminHtml, /data-admin-tab="library"/);
  assert.ok(adminHtml.indexOf('href="coach-exercise-library.html"') > adminHtml.indexOf('href="coach-workout-log.html"'));
  assert.ok(adminHtml.indexOf('data-admin-tab="home"') < adminHtml.indexOf('href="coach-workout-log.html"'));
  assert.match(libraryHtml, /<body class="dashboard-page coach-exercise-library-page">/);
  assert.match(libraryHtml, /id="exercise-library-page-title">Exercise library<\/h1>/);
  assert.match(libraryHtml, /href="coach-admin\.html">Back to FWB Coach<\/a>/);
  assert.ok(manifest.shortcuts.some((shortcut) => shortcut.url === "/coach-exercise-library.html"));
});

test("standalone library preserves cards, videos, uploads, and approvals", () => {
  assert.match(libraryHtml, /id="exercise-library-list"/);
  assert.match(libraryHtml, /data-exercise-library-view="videos"/);
  assert.match(libraryHtml, /id="exercise-library-upload-video"/);
  assert.match(libraryHtml, /id="client-added-exercises-link"/);
  assert.doesNotMatch(libraryHtml, /id="exercise-library-client-select"|>Client\s*<select/);
  assert.doesNotMatch(libraryHtml, /id="client-exercise-name-search"|Search client names/);
  assert.match(adminSource, /async function bootCoachExerciseLibrary\(\)/);
  assert.match(adminSource, /loadStandaloneExerciseLibraryClients\(\)/);
  assert.match(adminSource, /loadAllClientAddedExercises\(\)/);
  assert.match(adminSource, /\.coach-exercise-library-page[\s\S]*?\/coach-exercise-library\.html/);
});

test("standalone library has a full-width responsive shell", () => {
  assert.match(styles, /\.coach-exercise-library-page \.coach-exercise-library-shell\s*\{[^}]*width:\s*min\(1440px, calc\(100% - 48px\)\)/s);
  assert.match(styles, /\.coach-exercise-library-page \.exercise-library-panel\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.coach-exercise-library-hero\s*\{[^}]*flex-direction:\s*column/s);
});

test("catalog controls and exercise cards appear before client-name management and editing", () => {
  assert.match(styles, /\.coach-exercise-library-page \.exercise-library-layout\s*\{[^}]*display:\s*contents/s);
  assert.match(styles, /\.coach-exercise-library-page \.exercise-library-browser\s*\{[^}]*order:\s*1/s);
  assert.match(styles, /\.coach-exercise-library-page :is\(\.client-exercise-name-manager\)\s*\{[^}]*order:\s*2/s);
  assert.match(styles, /\.coach-exercise-library-page \.exercise-library-editor\s*\{[^}]*order:\s*3/s);
});

test("exercise cards and videos are grouped into familiar body-part sections", () => {
  assert.match(adminSource, /const exerciseLibraryBodyPartGroups = \[[\s\S]*?Chest[\s\S]*?Back[\s\S]*?Shoulders[\s\S]*?Arms[\s\S]*?Legs[\s\S]*?Core[\s\S]*?Full body[\s\S]*?Other/);
  assert.match(adminSource, /function exerciseLibraryBodyParts\(record = \{\}\)/);
  assert.match(adminSource, /\[record\.primary_muscle, \.\.\.\(record\.secondary_muscles \|\| \[\]\)\]/);
  assert.match(adminSource, /group\.muscles\.some\(\(muscle\) => muscles\.includes\(muscle\)\)/);
  assert.match(adminSource, /function exerciseLibraryGroupedMarkup\(records = \[\]\)/);
  assert.match(adminSource, /data-exercise-library-group="\$\{group\.key\}"/);
  assert.match(adminSource, /exerciseLibraryGroupedMarkup\(visible\)/);
  assert.match(styles, /\.exercise-library-group-heading\s*\{[^}]*border-bottom:\s*2px solid #dfe3dc/s);
  assert.match(styles, /\.exercise-library-group-list\s*\{[^}]*display:\s*grid[^}]*gap:\s*10px/s);
  assert.match(libraryHtml, /body-parts=2/);
});
