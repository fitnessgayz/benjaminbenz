const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("approved aliases replace stale workout artwork with the canonical branded WebP", () => {
  const source = [
    "approvedExerciseForName",
    "trustedExerciseImageUrl",
    "trustedExerciseMotionUrl",
    "exerciseMedia"
  ].map(sourceForFunction).join("\n");
  const resolveMedia = Function(
    "exerciseLibraryEntries",
    "exerciseNameMatcher",
    "window",
    `${source}; return exerciseMedia;`
  )(
    [{
      name: "Dumbbell Bench Press",
      aliases: ["Flat DB Bench Press", "Flat dumbbell bench press"],
      image_url: "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dumbbell-bench-press.webp"
    }],
    require("../js/exercise-name-matcher.js"),
    { FWB_SUPABASE_CONFIG: { url: "https://qukdfjeupjhpthfbaonv.supabase.co" } }
  );

  const result = resolveMedia({
    name: "flat db bench press",
    image_url: "https://benjaminbenz.com/images/exercises/old-bench-card.png"
  });

  assert.match(result.imageUrl, /webp-768\/dumbbell-bench-press[.]webp$/);
  assert.doesNotMatch(result.imageUrl, /old-bench-card/);
});

test("mobile thumbnails use 480px cards while the clickable demo keeps the 768px source", () => {
  const responsive = sourceForFunction("responsiveExerciseImageUrls");
  const trusted = sourceForFunction("trustedExerciseImageUrl");
  const urlsFor = Function(
    "window",
    `${trusted}; ${responsive}; return responsiveExerciseImageUrls;`
  )({ FWB_SUPABASE_CONFIG: { url: "https://qukdfjeupjhpthfbaonv.supabase.co" } });
  const full = "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dumbbell-bench-press.webp";

  assert.deepEqual(urlsFor(full), {
    fullUrl: full,
    thumbnailUrl: full.replace("/webp-768/", "/webp-480/")
  });
});

test("late exercise-library results hydrate programmed, custom, and active demo views", () => {
  const refresh = sourceForFunction("refreshExerciseMediaViews");
  const libraryAssignment = portal.indexOf("exerciseLibraryEntries = exerciseLibraryData || [];");
  const refreshCall = portal.indexOf("refreshExerciseMediaViews();", libraryAssignment);

  assert.match(refresh, /data-workout-preview-exercise-media/);
  assert.match(refresh, /data-exercise-log/);
  assert.match(refresh, /data-custom-workout-carousel/);
  assert.match(refresh, /renderCustomWorkoutGroupedExerciseKey\(carousel\)/);
  assert.ok(refreshCall > libraryAssignment, "media hydration must run after approved library records load");
  assert.match(portal, /data-workout-preview-exercise-media="\$\{escapeHtml\(exercise[.]name/);
});

test("the mobile dashboard cache key advances for the hydrated branded-card bundle", () => {
  assert.match(dashboard, /client-portal[.]js[^\"]*exercise-images=3/);
});
