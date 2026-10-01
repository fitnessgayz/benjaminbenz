const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const migrationName = "20261001133436_add_burpee_trx_exercise_cards.sql";
const migration = fs.readFileSync(path.join(root, "supabase", "migrations", migrationName), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "supabase", "storage-assets", "manifest.json"), "utf8"));

const entries = [
  ["Burpee", "burpee", "Ny8JWqh4lNg"],
  ["TRX Mid Row", "trx-mid-row", "7d8SbPUdHR0"],
  ["TRX Pull-Up", "trx-pull-up", "fAQwN4t-2JI"],
  ["TRX Squat to Y Fly", "trx-squat-to-y-fly", "32SsJD-9UeQ"],
  ["TRX Push-Up", "trx-push-up", "0FR4aqxb5XA"],
  ["TRX Split Squat", "trx-split-squat", "UVE3zNPMMY4"],
  ["TRX Pistol Squat", "trx-pistol-squat", "LXHP1GS4OuU"],
  ["TRX Chest Press", "trx-chest-press", "i_45-JMoXg4"],
  ["TRX Mountain Climber", "trx-mountain-climber", "wHLraop-0ZI"],
  ["TRX Single-Arm Row", "trx-single-arm-row", "fZjzpiOJjpg"],
  ["TRX Biceps Curl", "trx-biceps-curl", "AWJJxssRVDY"],
  ["TRX Triceps Press", "trx-triceps-press", "0xn4N5XRN2o"],
  ["TRX Chest Fly", "trx-chest-fly", "xpsTGTKyn8A"],
  ["TRX Hamstring Curl", "trx-hamstring-curl", "RkEHyudfkyM"],
  ["TRX Triceps Kickback", "trx-triceps-kickback", "0PV15OAETn8"],
  ["TRX Clock Press", "trx-clock-press", "iAVxnRyqH7k"],
  ["TRX Pike", "trx-pike", "GzSdbUhYUuU"],
  ["TRX Power Pull", "trx-power-pull", "fFGhTpQHOBA"],
  ["TRX Suspended Lunge", "trx-suspended-lunge", "3lxfMuEI5CY"],
  ["TRX Squat", "trx-squat", "DTXphTGYd0g"],
  ["TRX Lateral Lunge", "trx-lateral-lunge", "brUcfm485ao"]
];

test("Burpee and the official TRX exercise set have branded cards and videos", () => {
  assert.match(migration, /where lower\(name\) = 'burpee'/i);
  assert.match(migration, /'suspension_trainer'/);
  assert.equal((migration.match(/"name":"TRX /g) || []).length, 20);

  for (const [name, slug, videoId] of entries) {
    const media = manifest.exerciseMedia.find((entry) => entry.name === name);
    assert.ok(media, `missing media mapping for ${name}`);
    assert.match(media.imageUrl, new RegExp(`/webp-768/${slug}\\.webp$`));
    assert.equal(media.demoUrl, `https://www.youtube.com/watch?v=${videoId}`);

    for (const [folder, extension] of [["png", "png"], ["webp-480", "webp"], ["webp-768", "webp"]]) {
      const relative = `supabase/storage-assets/exercise-images/approved/2026-10-01/${folder}/${slug}.${extension}`;
      assert.ok(fs.existsSync(path.join(root, relative)), `missing ${relative}`);
      assert.ok(manifest.assets.some((asset) => asset.source === relative), `unlisted ${relative}`);
    }
  }
});

test("TRX video links are sourced from the reviewed official-channel index", () => {
  for (const [name, , videoId] of entries.slice(1)) {
    assert.match(migration, new RegExp(`"name":"${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}"`));
    assert.match(migration, new RegExp(`youtube\\.com/watch\\?v=${videoId.replace(/[-_]/g, "\\$&")}`));
  }
});

test("coach and workout generator expose suspension trainer equipment", () => {
  for (const file of ["coach-admin.html", "coach-exercise-library.html", "js/workout-generator.js"]) {
    assert.match(fs.readFileSync(path.join(root, file), "utf8"), /suspension_trainer/);
  }
});
