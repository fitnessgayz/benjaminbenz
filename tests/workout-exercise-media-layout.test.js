const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const css = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");
const workoutCss = fs.readFileSync(path.join(root, "css/workout-layout.css"), "utf8");
const compactSetupCss = fs.readFileSync(path.join(root, "css/client-workout-compact-setup.css"), "utf8");

test("opens uploaded motion first and keeps the full start/end card available", () => {
  assert.match(portal, /data-exercise-media-static/);
  assert.match(portal, /data-exercise-media-video/);
  assert.match(portal, /data-exercise-media-demo/);
  assert.match(portal, /data-exercise-media-instructions/);
  assert.match(portal, /loading="lazy"[\s\S]{0,80}decoding="async"/);
  assert.match(portal, /approvedExercise\?\.instructions \|\| exercise\.instructions/);
  assert.match(portal, /image\.src = staticUrl/);
  assert.match(portal, /renderExerciseMediaDialog\(dialog, Boolean\(videoUrl\)\)/);
  assert.match(portal, /Watch exercise video/);
  assert.match(portal, /data-exercise-media-video-link target="_blank" rel="noopener noreferrer"/);
  assert.match(portal, /videoLink\.href = demoUrl/);
  assert.match(portal, /video\.src = videoUrl/);
  assert.match(portal, /video\.controls = true/);
  assert.match(portal, /Show full start\/end card/);
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

test("keeps both poses visible in branded workout thumbnails", () => {
  assert.match(portal, /exercise-media-button-branded-crop/);
  assert.match(css, /\.exercise-media-button-branded-crop\s*\{[\s\S]*aspect-ratio: 176 \/ 117/);
  assert.match(css, /\.exercise-media-button-branded-crop > img\s*\{[\s\S]*object-position: left center/);
  assert.match(workoutCss, /\.workout-preview-exercise-media \.exercise-media-button-branded-crop/);
  const crop = compactSetupCss.match(/#client-workouts-panel \.exercise-media-button-branded-crop > img\s*\{([^}]*)\}/)?.[1] || "";
  const scale = Number(crop.match(/width:\s*([\d.]+)% !important/)?.[1]) / 100;
  // Both 480 × 209 and 480 × 240 cards put both photos in the first 345 pixels.
  assert.ok(Math.abs(480 / scale - 345) < 2);
  assert.match(crop, /top: 0 !important;[\s\S]*left: 0 !important;/);
  assert.match(compactSetupCss, /#client-workouts-panel \.exercise-media-button-branded-crop\.is-wide-branded-card > img\s*\{[^}]*width: 139\.13% !important;/);
  assert.match(compactSetupCss, /\.ios-log-exercise-image:has\(\.exercise-media-button-branded-crop > img\)\s*\{[^}]*aspect-ratio: 345 \/ 240 !important;/);
  assert.match(compactSetupCss, /\.ios-log-exercise-image:has\(\.exercise-media-button-branded-crop\.is-wide-branded-card > img\)\s*\{[^}]*aspect-ratio: 345 \/ 209 !important;/);
});

test("recognizes approved cards served from both storage and the website", () => {
  const helper = portal.slice(portal.indexOf("function isBrandedExerciseImage("), portal.indexOf("function exerciseMediaButtonMarkup("));
  const isBrandedExerciseImage = Function(`${helper}\nreturn isBrandedExerciseImage;`)();
  assert.equal(isBrandedExerciseImage("https://example.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-480/leg-press.webp"), true);
  assert.equal(isBrandedExerciseImage("https://benjaminbenz.com/images/exercises/approved/2026-09-29/png/leg-press.png"), true);
  assert.equal(isBrandedExerciseImage("https://benjaminbenz.com/images/exercises/photo-only.png"), false);
});

test("shows the complete branded card without cropping in the detail dialog", () => {
  assert.match(css, /\.exercise-media-dialog-stage\.is-branded-card\s*\{[\s\S]*?width:\s*100%/);
  assert.match(css, /\.exercise-media-dialog-stage\.is-branded-card > img\s*\{[\s\S]*?position:\s*static[\s\S]*?object-fit:\s*contain/);
  assert.doesNotMatch(css, /\.exercise-media-dialog-stage\.is-branded-card\s*\{[\s\S]*?aspect-ratio:\s*176 \/ 117/);
});

test("offers a separate full demo even when an illustration animation is available", () => {
  assert.match(portal, /const demoUrl = exerciseVideoUrl\(exercise\)/);
  assert.match(portal, /videoLink\.hidden = !hasSeparateDemo/);
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

test("full-card framing applies only to branded stills and clears for video and ordinary images", () => {
  const helper = portal.slice(portal.indexOf("function isBrandedExerciseImage("), portal.indexOf("function exerciseMediaButtonMarkup("));
  const renderer = portal.slice(portal.indexOf("function renderExerciseMediaDialog("), portal.indexOf("function openExerciseMedia("));
  const render = Function("trustedExerciseImageUrl", "trustedExerciseMotionUrl", "exerciseVideoUrl", "youtubeExerciseSearchUrl", "document",
    `${helper}\n${renderer}\nreturn renderExerciseMediaDialog;`)(
    (url) => url, (url) => url, (exercise) => exercise.video || "", () => "https://youtube.com/results?search_query=shoulder", {
      createElement: (tag) => ({ tag, setAttribute() {}, addEventListener() {} }),
    });
  let showsFullCard = false;
  let media;
  const stage = {
    classList: { toggle: (name, value) => { assert.equal(name, "is-branded-card"); showsFullCard = value; } },
    replaceChildren: (node) => { media = node; },
  };
  const caption = {};
  const demo = { setAttribute() {}, removeAttribute() { delete this.href; } };
  const dialog = {
    dataset: {
      exerciseMediaName: "Shoulder press",
      exerciseMediaStatic: "https://example.com/exercise-images/approved/2026-09-29/webp-768/shoulder-press.webp",
      exerciseMediaVideo: "https://example.com/demo.mp4",
    },
    querySelector: (selector) => ({
      "[data-exercise-media-stage]": stage,
      "[data-exercise-media-caption]": caption,
      "[data-exercise-media-video-link]": demo,
    })[selector],
  };
  render(dialog, false);
  assert.equal(showsFullCard, true);
  assert.equal(media.tag, "img");
  assert.equal(media.alt, "Shoulder press start and end positions");
  render(dialog, true);
  assert.equal(showsFullCard, false);
  assert.equal(media.tag, "video");
  assert.equal(media.controls, true);
  assert.equal(media.autoplay, true);
  assert.equal(media.loop, true);
  dialog.dataset.exerciseMediaVideo = "https://example.com/start-end.webp";
  render(dialog, true);
  assert.equal(showsFullCard, false);
  assert.equal(media.tag, "img");
  assert.equal(media.alt, "Shoulder press animated exercise demonstration");
  dialog.dataset.exerciseMediaDemo = "https://example.com/full-demo.mp4";
  render(dialog, true);
  assert.equal(demo.hidden, false);
  assert.equal(demo.href, "https://example.com/full-demo.mp4");
  dialog.dataset.exerciseMediaDemo = "https://youtube.com/results?search_query=shoulder";
  render(dialog, true);
  assert.equal(demo.hidden, true);
  render(dialog, false);
  assert.equal(showsFullCard, true);
  dialog.dataset.exerciseMediaStatic = "https://example.com/images/exercises/plain-photo.jpg";
  render(dialog, false);
  assert.equal(showsFullCard, false);
  assert.equal(media.tag, "img");
  dialog.dataset.exerciseMediaStatic = "https://example.com/exercise-images/anatomy/2026-11-22/shoulder-press.webp";
  render(dialog, false);
  assert.equal(caption.textContent, "Start and end · muscles worked");
});
