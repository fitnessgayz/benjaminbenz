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
  assert.match(libraryHtml, /id="exercise-library-client-select"/);
  assert.match(adminSource, /async function bootCoachExerciseLibrary\(\)/);
  assert.match(adminSource, /loadStandaloneExerciseLibraryClients\(\)/);
  assert.match(adminSource, /loadAllClientAddedExercises\(\)/);
  assert.match(adminSource, /\.coach-exercise-library-page[\s\S]*?\/coach-exercise-library\.html/);
});

test("standalone library has a full-width responsive shell", () => {
  assert.match(styles, /\.coach-exercise-library-page \.coach-exercise-library-shell\s*\{[^}]*width:\s*min\(1440px, calc\(100% - 48px\)\)/s);
  assert.match(styles, /\.coach-exercise-library-page \.exercise-library-panel\s*\{[^}]*display:\s*block/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.coach-exercise-library-hero\s*\{[^}]*flex-direction:\s*column/s);
});
