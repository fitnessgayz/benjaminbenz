const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migrationName = "20261001161518_add_official_trx_exercise_cards_batch_two.sql";
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", migrationName), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "supabase", "storage-assets", "manifest.json"), "utf8"));
const entries = [
  ["TRX Plank", "trx-plank", "nLgeqEtm49M"],
  ["TRX Forearm Plank", "trx-forearm-plank", "3CXvwTv9m6Q"],
  ["TRX Kneeling Rollout", "trx-kneeling-rollout", "XQOYs0nurds"],
  ["TRX Standing Rollout", "trx-standing-rollout", "kUb7N9sJ-vo"],
  ["TRX Side Plank", "trx-side-plank", "eSTnnrM_xhc"],
  ["TRX Atomic Push-Up", "trx-atomic-push-up", "Xc5b-MvKxQY"],
  ["TRX Modified Burpee", "trx-modified-burpee", "rTwzW6EX-BY"],
  ["TRX Single-Leg Hip Press", "trx-single-leg-hip-press", "hXhqE5EKyAE"],
  ["TRX Hip Press", "trx-hip-press", "rpxi7xQ1xUs"],
  ["TRX Sprinter Start", "trx-sprinter-start", "Nr-iGy-0IUk"],
  ["TRX Squat Jump", "trx-squat-jump", "japaBJ9xtS4"],
  ["TRX Body Saw", "trx-body-saw", "ClXC0_yNsoM"]
];

test("second official TRX batch stays synchronized with cards and videos", () => {
  assert.ok(manifest.migrations.includes(migrationName));
  assert.equal((migration.match(/"name":"TRX /g) || []).length, entries.length);
  for (const [name, slug, videoId] of entries) {
    assert.match(migration, new RegExp(`"name":"${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}"`));
    assert.match(migration, new RegExp(videoId.replace(/[-_]/g, "\\$&")));
    const media = manifest.exerciseMedia.find((entry) => entry.name === name);
    assert.ok(media, `missing media mapping for ${name}`);
    assert.match(media.imageUrl, new RegExp(`/webp-768/${slug}\\.webp$`));
    assert.ok(media.demoUrl.endsWith(videoId));
    for (const [folder, extension] of [["png", "png"], ["webp-480", "webp"], ["webp-768", "webp"]]) {
      const relative = `supabase/storage-assets/exercise-images/approved/2026-10-01/${folder}/${slug}.${extension}`;
      assert.ok(fs.existsSync(path.join(root, relative)), `missing ${relative}`);
      assert.ok(manifest.assets.some((asset) => asset.source === relative), `unlisted ${relative}`);
    }
  }
});
