const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");

test("uses a static lazy thumbnail and defers the optional motion WebP until activation", () => {
  assert.match(portal, /data-exercise-media-static/);
  assert.match(portal, /data-exercise-media-animated/);
  assert.match(portal, /loading="lazy" decoding="async"/);
  assert.match(portal, /exercise\.motion_url \|\| exercise\.motionUrl \|\| approvedExercise\?\.motion_url/);
  assert.match(portal, /image\.src = animatedUrl \|\| staticUrl/);
  assert.doesNotMatch(portal, /class="exercise-media-button[\s\S]{0,500}<video/);
});

test("accepts motion only from approved first-party WebP locations", () => {
  assert.match(portal, /exercise-images\\\/approved[\s\S]*\\\.webp/);
  assert.match(portal, /images\\\/exercises[\s\S]*\\\.webp/);
  assert.match(portal, /select\("[^"]*image_url,motion_url/);
});

test("reuses the photo-rich exercise key in grouped custom and assigned workouts", () => {
  assert.match(portal, /function customWorkoutGroupedExerciseKeyMarkup/);
  assert.match(portal, /exerciseMediaButtonMarkup\(\{ name: exerciseName \}, \{ compact: true \}\)/);
  assert.match(portal, /customWorkoutCarouselGroupMarkup\(format, exercises/);
  assert.match(portal, /assignedWorkoutCarouselMarkup[\s\S]*customWorkoutCarouselGroupMarkup/);
  assert.match(css, /grid-template-columns: clamp\(116px, 34%, 210px\) minmax\(0, 1fr\) 28px/);
});

test("keeps suggested-target UI out of the visible exercise card", () => {
  assert.match(css, /\.workout-progression-group-slot,[\s\S]*\[data-workout-progression\][\s\S]*display: none !important/);
});
