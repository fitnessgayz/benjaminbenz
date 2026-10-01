const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationName = "20261001044225_add_cross_source_exercise_cards.sql";
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations", migrationName),
  "utf8",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "supabase/storage-assets/manifest.json"), "utf8"),
);

const exercises = [
  ["Barbell Row", "barbell-row", "TZLCvXbej_Q"],
  ["Reverse Lunge", "reverse-lunge", "TQfhY5oJ_Sc"],
  ["Cable Pull-Through", "cable-pull-through", "pv8e6OSyETE"],
  ["Nordic Hamstring Curl", "nordic-hamstring-curl", "_e9vFU9-tkc"],
  ["Copenhagen Plank", "copenhagen-plank", "kD1t1hWzIDE"],
  ["Sumo Deadlift", "sumo-deadlift", "GyeXtU8vj-Y"],
  ["Suitcase Carry", "suitcase-carry", "LJaq4BS7KpE"],
  ["Band External Rotation", "band-external-rotation", "ZJgOL828OvY"],
];

test("cross-source migration declares all eight approved exercises and videos", () => {
  assert.ok(manifest.migrations.includes(migrationName));

  for (const [name, slug, videoId] of exercises) {
    assert.match(migration, new RegExp(`"name":"${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(migration, new RegExp(`"slug":"${slug}"`));
    assert.match(migration, new RegExp(`youtube[.]com/watch[?]v=${videoId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    const mapping = manifest.exerciseMedia.find((entry) => entry.name === name);
    assert.equal(
      mapping?.imageUrl,
      `https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/${slug}.webp`,
    );
    assert.equal(mapping?.demoUrl, `https://www.youtube.com/watch?v=${videoId}`);
  }
});

test("each new branded card has immutable PNG, 480w, and 768w assets", () => {
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
