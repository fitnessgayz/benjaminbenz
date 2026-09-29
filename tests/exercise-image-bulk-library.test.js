const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260929005612_link_bulk_exercise_images.sql"),
  "utf8",
);
const mediaAliasesMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260929173000_add_workout_exercise_media_aliases.sql"),
  "utf8",
);
const commonAliasesMigration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260929161404_add_common_exercise_media_aliases.sql"),
  "utf8",
);

test("bulk exercise images link only approved, active records without replacing existing images", () => {
  const objectNames = [...migration.matchAll(/\('([^']+[.]png)'\)/g)].map((match) => match[1]);

  assert.equal(objectNames.length, 64);
  assert.equal(new Set(objectNames).size, 64);
  assert.match(migration, /exercise[.]is_approved/);
  assert.match(migration, /exercise[.]is_active/);
  assert.match(migration, /exercise[.]image_url is null/);
  assert.doesNotMatch(migration, /assisted-pull-up[.]png/);
  assert.doesNotMatch(migration, /glute-kickback-machine[.]png/);
  assert.doesNotMatch(migration, /hip-abduction-machine[.]png/);
  assert.doesNotMatch(migration, /45-degree-glute-drive-machine[.]png/);
  assert.doesNotMatch(migration, /pec-deck-chest-fly[.]png/);
  assert.doesNotMatch(migration, /decline-cable-fly[.]png/);
});

test("common workout labels resolve to existing approved exercise artwork", () => {
  assert.match(mediaAliasesMigration, /Alternating Dumbbell Curl/);
  assert.match(mediaAliasesMigration, /Rear-delt fly/);
  assert.match(mediaAliasesMigration, /where lower\(name\) = 'dumbbell curl'/i);
  assert.match(mediaAliasesMigration, /where lower\(name\) = 'dumbbell reverse fly'/i);
  assert.doesNotMatch(mediaAliasesMigration, /set image_url/i);
});

test("branded exercise cards gain only equipment- and posture-safe aliases", () => {
  const expectedMappings = [
    ["Dumbbell Bench Press", "Flat Dumbbell Bench Press"],
    ["Dumbbell Bench Press", "DB Bench Press"],
    ["Hack Squat", "Hack Squat Machine"],
    ["Dumbbell Reverse Fly", "Reverse Dumbbell Flys"],
    ["Pec Deck Chest Fly", "Pec Deck Fly"],
    ["Lying Leg Raise", "Lying Leg Lifts"],
    ["Plank", "Forearm Plank"],
  ];

  expectedMappings.forEach(([canonical, alias]) => {
    assert.match(commonAliasesMigration, new RegExp(
      `\\('${canonical.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}', '${alias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}'\\)`
    ));
  });

  [
    "Shoulder Press",
    "Row Machine",
    "Incline Chest Press",
    "Single Arm Row",
    "Kickback Machine",
  ].forEach((ambiguousAlias) => {
    assert.doesNotMatch(
      commonAliasesMigration,
      new RegExp(`\\('[^']+', '${ambiguousAlias.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}'\\)`)
    );
  });

  assert.match(commonAliasesMigration, /exercise[.]is_active/i);
  assert.match(commonAliasesMigration, /exercise[.]is_approved/i);
  assert.doesNotMatch(commonAliasesMigration, /set\s+image_url/i);
});
