const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");
const workoutCss = fs.readFileSync(path.join(root, "css/workout-layout.css"), "utf8");

test("opens the static branded card first and offers video as a secondary action", () => {
  assert.match(portal, /data-exercise-media-static/);
  assert.match(portal, /data-exercise-media-video/);
  assert.match(portal, /data-exercise-media-demo/);
  assert.match(portal, /data-exercise-media-instructions/);
  assert.match(portal, /loading="lazy"[\s\S]{0,80}decoding="async"/);
  assert.match(portal, /approvedExercise\?\.instructions \|\| exercise\.instructions/);
  assert.match(portal, /image\.src = staticUrl/);
  assert.match(portal, /renderExerciseMediaDialog\(dialog, false\)/);
  assert.match(portal, /Watch exercise video/);
  assert.match(portal, /data-exercise-media-video-link target="_blank" rel="noopener noreferrer"/);
  assert.match(portal, /videoLink\.href = demoUrl/);
  assert.match(portal, /video\.src = videoUrl/);
  assert.match(portal, /video\.controls = true/);
  assert.match(portal, /Show static card/);
  assert.doesNotMatch(portal, /data-exercise-media-animated/);
  assert.doesNotMatch(portal, /class="exercise-media-button[\s\S]{0,500}<video/);
});

test("uses the 480w branded card in lists and keeps the 768w card for the full demo", () => {
  assert.match(portal, /function responsiveExerciseImageUrls/);
  assert.match(portal, /webp-768/);
  assert.match(portal, /webp-480/);
  assert.match(portal, /data-exercise-media-fallback/);
  assert.match(portal, /image\.removeAttribute\("srcset"\)/);
  assert.match(portal, /srcset=/);
  assert.match(portal, /data-exercise-media-static="\$\{escapeHtml\(fullUrl\)\}"/);
});

test("crops branded list thumbnails to the Start and End photos without the pale rim", () => {
  assert.match(portal, /exercise-media-button-branded-crop/);
  assert.match(css, /\.exercise-media-button-branded-crop\s*\{[\s\S]*aspect-ratio: 176 \/ 117/);
  assert.match(css, /\.exercise-media-button-branded-crop > img\s*\{[\s\S]*object-position: left center/);
  assert.match(workoutCss, /\.workout-preview-exercise-media \.exercise-media-button-branded-crop/);
});

test("offers approved YouTube demos when a static card has no uploaded motion video", () => {
  assert.match(portal, /const demoUrl = exerciseVideoUrl\(exercise\)/);
  assert.match(portal, /videoLink\.hidden = Boolean\(videoUrl \|\| !demoUrl\)/);
  assert.match(css, /data-exercise-media-video-link/);
});

test("loads both static artwork and instructions from the approved exercise library", () => {
  assert.match(portal, /select\("[^"]*image_url,motion_url/);
  assert.match(portal, /image_url,motion_url,instructions/);
  assert.match(portal, /data-exercise-media-instructions/);
});

test("reuses the photo-rich exercise key in grouped custom and assigned workouts", () => {
  assert.match(portal, /function customWorkoutGroupedExerciseKeyMarkup/);
  assert.match(portal, /exerciseMediaButtonMarkup\(\{ name: exerciseName \}, \{ compact: true \}\)/);
  assert.match(portal, /customWorkoutCarouselGroupMarkup\(format, exercises/);
  assert.match(portal, /assignedWorkoutCarouselMarkup[\s\S]*customWorkoutCarouselGroupMarkup/);
  assert.match(css, /grid-template-columns: clamp\(116px, 34%, 210px\) minmax\(0, 1fr\) 28px/);
});

test("uses branded exercise cards in the editable workout-plan list", () => {
  assert.match(portal, /class="workout-preview-exercise-card"/);
  assert.match(portal, /workout-preview-exercise-media[^\n]*exerciseMediaButtonMarkup\(exercise, \{ compact: true \}\)/);
  assert.match(workoutCss, /\.workout-preview-exercises \.workout-preview-exercise-card/);
  assert.match(workoutCss, /\.workout-preview-exercise-media \.exercise-media-button/);
});

test("keeps suggested-target UI out of the visible exercise card", () => {
  assert.match(css, /\.workout-progression-group-slot,[\s\S]*\[data-workout-progression\][\s\S]*display: none !important/);
});

test("photo framing applies only to branded stills and clears for video and ordinary images", () => {
  const helper = portal.slice(portal.indexOf("function isBrandedExerciseImage("), portal.indexOf("function exerciseMediaButtonMarkup("));
  const renderer = portal.slice(portal.indexOf("function renderExerciseMediaDialog("), portal.indexOf("function openExerciseMedia("));
  const render = Function("trustedExerciseImageUrl", "trustedExerciseMotionUrl", "exerciseVideoUrl", "document",
    `${helper}\n${renderer}\nreturn renderExerciseMediaDialog;`)(
    (url) => url, (url) => url, () => "", {
      createElement: (tag) => ({ tag, setAttribute() {} }),
    });
  let cropped = false;
  let media;
  const stage = {
    classList: { toggle: (name, value) => { assert.equal(name, "is-branded-photo"); cropped = value; } },
    replaceChildren: (node) => { media = node; },
  };
  const dialog = {
    dataset: {
      exerciseMediaName: "Shoulder press",
      exerciseMediaStatic: "https://example.com/exercise-images/approved/2026-09-29/webp-768/shoulder-press.webp",
      exerciseMediaVideo: "https://example.com/demo.mp4",
    },
    querySelector: (selector) => selector === "[data-exercise-media-stage]" ? stage : null,
  };
  render(dialog, false);
  assert.equal(cropped, true);
  assert.equal(media.tag, "img");
  assert.equal(media.alt, "Shoulder press start and end positions");
  render(dialog, true);
  assert.equal(cropped, false);
  assert.equal(media.tag, "video");
  assert.equal(media.controls, true);
  render(dialog, false);
  assert.equal(cropped, true);
  dialog.dataset.exerciseMediaStatic = "https://example.com/images/exercises/plain-photo.jpg";
  render(dialog, false);
  assert.equal(cropped, false);
  assert.equal(media.tag, "img");
});
