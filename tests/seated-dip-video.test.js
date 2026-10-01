const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261001041547_add_seated_dip_video.sql"),
  "utf8",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "supabase/storage-assets/manifest.json"), "utf8"),
);
const expectedUrl = "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/seated-dip-machine.mp4";

test("Seated Dip Machine uses the submitted video for motion and demo actions", () => {
  assert.match(migration, /where lower\(name\) = 'seated dip machine'/i);
  assert.match(migration, /'Seated Dip'/);
  assert.equal((migration.match(/generated\/2026-09-30\/seated-dip-machine[.]mp4/g) || []).length, 2);
  assert.doesNotMatch(migration, /youtu(?:be[.]com|[.]be)/i);

  const mapping = manifest.exerciseMedia.find((entry) => entry.name === "Seated Dip Machine");
  assert.equal(mapping?.motionUrl, expectedUrl);
  assert.equal(mapping?.demoUrl, expectedUrl);
});

test("Seated Dip Machine video is a declared immutable Storage asset", () => {
  const asset = manifest.assets.find((entry) => entry.objectPath === "generated/2026-09-30/seated-dip-machine.mp4");
  assert.equal(asset?.source, "supabase/storage-assets/exercise-videos/generated/2026-09-30/seated-dip-machine.mp4");
  assert.equal(asset?.contentType, "video/mp4");
  assert.equal(asset?.cacheControl, 31536000);
  assert.ok(fs.statSync(path.join(root, asset.source)).size > 0);
});
