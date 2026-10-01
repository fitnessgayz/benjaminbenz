const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const source = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

test("exercise library presents its catalog as branded visual cards", () => {
  assert.match(html, /class="exercise-library-intro-title">Visual catalog<\/h3>/);
  assert.match(html, /id="exercise-library-view-title">Exercise cards<\/h3>/);
  assert.match(source, /class="exercise-library-card\$\{/);
  assert.match(source, /exerciseLibraryMediaMarkup\(record\)/);
  assert.match(source, /class="exercise-library-card-brand"[^>]*>FWB/);
  assert.match(source, /record\.default_sets[\s\S]*?record\.default_reps/);
  assert.match(styles, /\.exercise-library-card\s*\{[\s\S]*?grid-template-columns:/);
});

test("exercise cards play trusted uploaded and YouTube demos inline", () => {
  assert.match(source, /uploadedExerciseDemoUrl\(record\?\.demo_url\)/);
  assert.match(source, /function exerciseLibraryYoutubeId\(value\)/);
  assert.match(source, /youtube-nocookie\.com\/embed\/\$\{encodeURIComponent\(youtubeId\)\}/);
  assert.match(source, /<video controls playsinline preload="metadata"/);
  assert.match(source, /data-exercise-library-youtube-id=/);
  assert.match(source, /\^\[a-zA-Z0-9_-\]\{6,15\}\$/);
});

test("exercise library has a keyboard-accessible videos-only tab", () => {
  assert.match(html, /role="tablist"[^>]*aria-label="Exercise library views"/);
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*data-exercise-library-view="cards"/);
  assert.match(html, /role="tab"[^>]*aria-selected="false"[^>]*data-exercise-library-view="videos"/);
  assert.match(html, /id="exercise-library-video-count"/);
  assert.match(source, /function exerciseLibraryHasVideo\(record\)/);
  assert.match(source, /exerciseLibraryView === "videos" \? videoRecords : exerciseLibraryRecords/);
  assert.match(source, /\["ArrowLeft", "ArrowRight"\]/);
  assert.match(styles, /\.exercise-library-view-tabs button\.is-selected\s*\{[\s\S]*?background: var\(--lime\)/);
});

test("videos view exposes the existing secure upload flow", () => {
  assert.match(html, /id="exercise-library-upload-video"[^>]*hidden>[\s\S]*?Upload video/);
  assert.match(source, /uploadVideoButton\.hidden = exerciseLibraryView !== "videos"/);
  assert.match(source, /document\.getElementById\("exercise-library-video"\)\.click\(\)/);
  assert.match(source, /Choose a demo video, finish the exercise details, then save/);
  assert.match(styles, /\.exercise-library-upload-video-button\s*\{[\s\S]*?background: var\(--lime\)/);
});

test("exercise library exposes an all-client approval queue", () => {
  assert.match(html, /id="client-added-exercises-link"[^>]*aria-controls="client-added-exercise-review"/);
  assert.match(html, /id="client-added-exercise-review"[^>]*hidden/);
  assert.match(html, /id="client-added-exercise-list"[^>]*aria-live="polite"/);
  assert.match(source, /function allClientAddedExerciseGroups\(logs = allClientAddedExerciseLogs\)/);
  assert.match(source, /\.from\("client_workout_logs"\)[\s\S]*?\.ilike\("workout_title", "Custom workout%"\)/);
  assert.match(source, /data-approve-client-added-exercise=/);
  assert.match(source, /Saving will approve it and add it to the shared library/);
  assert.match(source, /is_approved: true[\s\S]*?is_active: true/);
  assert.match(styles, /\.client-added-exercises-link\s*\{[\s\S]*?border-left: 5px solid var\(--lime\)/);
});

test("known branded exercise artwork is connected to matching catalog names", () => {
  for (const relativePath of Object.values({
    arnold: "images/exercises/instruction-cards/2026-09-29/arnold-press.png",
    uprightRow: "images/exercises/instruction-cards/2026-09-30/barbell-upright-row.webp",
    inclinePress: "images/mockups/exercise-card-v2/incline-dumbbell-press.png"
  })) {
    assert.match(source, new RegExp(relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, `${relativePath} should exist`);
  }
});
