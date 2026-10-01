const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationName = "20261001052254_add_diverse_exercise_cards_batch_three.sql";
const migration = fs.readFileSync(path.join(root, "supabase/migrations", migrationName), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "supabase/storage-assets/manifest.json"), "utf8"),
);

const exercises = [
  ["Hand-Release Push-Up", "hand-release-push-up", "K0e8omOJZ14"],
  ["Plank Row", "plank-row", "BSdf2Y4nfXY"],
  ["Bent-Over Fly", "bent-over-fly", "R0TK2cWM96s"],
  ["Rotational Press", "rotational-press", "IwrtVPsaZAA"],
  ["Overhead Carry", "overhead-carry", "HkRlHxxI1oI"],
  ["Cossack Squat", "cossack-squat", "shYSWbqBJPM"],
  ["Scapular Push-Up", "scapular-push-up", "DQKayQOU5Pw"],
  ["Kettlebell Swing", "kettlebell-swing", "1cVT3ee9mgU"],
];

test("batch-three migration and media mappings stay in sync", () => {
  assert.ok(manifest.migrations.includes(migrationName));
  for (const [name, slug, videoId] of exercises) {
    assert.ok(migration.includes(`"name":"${name}"`));
    assert.ok(migration.includes(`"slug":"${slug}"`));
    assert.ok(migration.includes(`youtube.com/watch?v=${videoId}`));
    const mapping = manifest.exerciseMedia.find((entry) => entry.name === name);
    assert.equal(
      mapping?.imageUrl,
      `https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/${slug}.webp`,
    );
    assert.equal(mapping?.demoUrl, `https://www.youtube.com/watch?v=${videoId}`);
  }
});

test("each batch-three card has all three responsive source assets", () => {
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
