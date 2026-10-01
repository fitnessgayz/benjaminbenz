const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20261001040950_add_leg_extension_video.sql"),
  "utf8",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "supabase/storage-assets/manifest.json"), "utf8"),
);
const expectedUrl = "https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/leg-extension.mp4";

test("Leg Extension uses the submitted video for motion and demo actions", () => {
  assert.match(migration, /where lower\(name\) = 'leg extension'/i);
  assert.equal((migration.match(/generated\/2026-09-30\/leg-extension[.]mp4/g) || []).length, 2);
  assert.doesNotMatch(migration, /youtu(?:be[.]com|[.]be)/i);

  const mapping = manifest.exerciseMedia.find((entry) => entry.name === "Leg Extension");
  assert.equal(mapping?.motionUrl, expectedUrl);
  assert.equal(mapping?.demoUrl, expectedUrl);
});

test("Leg Extension video is a declared immutable Storage asset", () => {
  const asset = manifest.assets.find((entry) => entry.objectPath === "generated/2026-09-30/leg-extension.mp4");
  assert.equal(asset?.source, "supabase/storage-assets/exercise-videos/generated/2026-09-30/leg-extension.mp4");
  assert.equal(asset?.contentType, "video/mp4");
  assert.equal(asset?.cacheControl, 31536000);
  assert.ok(fs.statSync(path.join(root, asset.source)).size > 0);
});
