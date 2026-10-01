const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationName = "20261001050521_add_diverse_exercise_cards_batch_two.sql";
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations", migrationName),
  "utf8",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "supabase/storage-assets/manifest.json"), "utf8"),
);

const exercises = [
  ["Dumbbell Pullover", "dumbbell-pullover", "jQjWlIwG4sI"],
  ["Meadows Row", "meadows-row", "j-H6OxNlhi8"],
  ["Turkish Get-Up", "turkish-get-up", "jFK8FOiLa_M"],
  ["Tall-Kneeling Pallof Press", "tall-kneeling-pallof-press", "tYsV8_X3vtw"],
  ["Bear Crawl", "bear-crawl", "ZnYa6e_MCvQ"],
  ["Forward Step-Down", "forward-step-down", "B3CjUyMouBA"],
  ["Lateral Lunge", "lateral-lunge", "tVqYQkAYabo"],
  ["Single-Leg Glute Bridge", "single-leg-glute-bridge", "hpLQEPdqUXM"],
];

test("batch-two migration declares all eight approved exercises and videos", () => {
  assert.ok(manifest.migrations.includes(migrationName));

  for (const [name, slug, videoId] of exercises) {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedVideoId = videoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(migration, new RegExp(`"name":"${escapedName}"`));
    assert.match(migration, new RegExp(`"slug":"${slug}"`));
    assert.match(migration, new RegExp(`youtube[.]com/watch[?]v=${escapedVideoId}`));

    const mapping = manifest.exerciseMedia.find((entry) => entry.name === name);
    assert.equal(
      mapping?.imageUrl,
      `https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/${slug}.webp`,
    );
    assert.equal(mapping?.demoUrl, `https://www.youtube.com/watch?v=${videoId}`);
  }
});

test("each batch-two card has PNG, 480w, and 768w assets", () => {
  for (const [, slug] of exercises) {
    for (const [variant, extension, contentType] of [
      ["png", "png", "image/png"],
      ["webp-480", "webp", "image/webp"],
      ["webp-768", "webp", "image/webp"],
    ]) {
      const objectPath = `approved/2026-09-30/${variant}/${slug}.${extension}`;
      const asset = manifest.assets.find((entry) => entry.objectPath === objectPath);
      assert.equal(asset?.contentType, contentType);
      assert.equal(asset?.cacheControl, 31536000);
      assert.ok(fs.statSync(path.join(root, asset.source)).size > 0);
    }
  }
});
