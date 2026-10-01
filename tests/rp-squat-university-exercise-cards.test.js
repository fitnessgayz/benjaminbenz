const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const migrationName = "20261001130710_add_rp_squat_university_exercise_cards.sql";
const migration = fs.readFileSync(path.join(root, "supabase/migrations", migrationName), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "supabase/storage-assets/manifest.json"), "utf8"));

const exercises = [
  ["EZ-Bar Spider Curl", "ez-bar-spider-curl", "WG3vdcq__I0"],
  ["Dumbbell Spider Curl", "dumbbell-spider-curl", "ke2shAeQ0O8"],
  ["Deficit Push-Up", "deficit-push-up", "gmNlqsE3Onc"],
  ["Machine Lateral Raise", "machine-lateral-raise", "0o07iGKUarI"],
  ["Stiff-Leg Deadlift", "stiff-leg-deadlift", "Ka6GhzIfh-c"],
  ["Sumo Deficit Deadlift", "sumo-deficit-deadlift", "bnYekgCKfv0"],
  ["JM Press", "jm-press", "Tih5iHyELsE"],
  ["T-Bar Row", "t-bar-row", "yPis7nlbqdY"],
  ["Kettlebell Arm Bar", "kettlebell-arm-bar", "Ya0DCt11wGI"],
  ["Box Squat", "box-squat", "rRihE4weYg4"],
  ["GHD Back Extension", "ghd-back-extension", "ixr4_1POpzg"],
  ["Goblet Squat Stretch", "goblet-squat-stretch", "ShvTpCsgTiw"],
  ["Banded Hip Mobilization", "banded-hip-mobilization", "99pb0NnE4Kw"],
  ["Banded Ankle Mobilization", "banded-ankle-mobilization", "ILSbK8RnGdI"],
  ["Foam Roller Pec Stretch", "foam-roller-pec-stretch", "OJ4G6gg8Y9I"],
  ["Deep Squat Rotation", "deep-squat-rotation", "enThal66tUs"],
  ["External Rotation Press", "external-rotation-press", "NIK0aJDO7Pk"],
  ["Split-Stance Romanian Deadlift", "split-stance-romanian-deadlift", "_e7OFsxJMfU"],
];

test("RP and Squat University migration stays in sync with media", () => {
  assert.ok(manifest.migrations.includes(migrationName));
  for (const [name, slug, videoId] of exercises) {
    assert.ok(migration.includes(`"name": "${name}"`));
    assert.ok(migration.includes(`youtube.com/watch?v=${videoId}`));
    const mapping = manifest.exerciseMedia.find((entry) => entry.name === name);
    assert.equal(mapping?.imageUrl, `https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-01/webp-768/${slug}.webp`);
    assert.equal(mapping?.demoUrl, `https://www.youtube.com/watch?v=${videoId}`);
    for (const [variant, extension, contentType] of [["png", "png", "image/png"], ["webp-480", "webp", "image/webp"], ["webp-768", "webp", "image/webp"]]) {
      const objectPath = `approved/2026-10-01/${variant}/${slug}.${extension}`;
      const asset = manifest.assets.find((entry) => entry.objectPath === objectPath);
      assert.equal(asset?.contentType, contentType);
      assert.ok(fs.statSync(path.join(root, asset.source)).size > 0);
    }
  }
});
