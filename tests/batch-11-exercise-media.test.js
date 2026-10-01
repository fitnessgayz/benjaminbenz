const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const matcher = require("../js/exercise-name-matcher.js");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260929203000_add_batch_11_exercise_media.sql"),
  "utf8",
);

test("batch 11 points only the four approved cards at versioned 768px WebPs", () => {
  const insertedSlugs = [
    "belt-squat",
    "pendulum-squat-machine",
    "glute-squat-machine",
  ];

  insertedSlugs.forEach((slug) => {
    assert.match(migration, new RegExp(`"slug":"${slug}"`));
  });
  assert.match(migration, /approved\/2026-09-29\/webp-768\/' \|\| slug \|\| '[.]webp'/);
  assert.match(migration, /webp-768\/dual-45-hip-extension[.]webp/);
  assert.match(migration, /where lower\(name\) = lower\('45-Degree Back Extension'\)/);
  assert.doesNotMatch(migration, /45-degree-hip-extension[.]webp/);
  assert.doesNotMatch(migration, /glute-squat-machine-corrected/);
});

test("batch 11 aliases resolve differently worded workout names to the intended cards", () => {
  const library = [
    { name: "Belt Squat", aliases: ["Belt Squat Machine", "Machine Belt Squat"], equipment: "machine" },
    { name: "Pendulum Squat Machine", aliases: ["Pendulum Squat", "Machine Pendulum Squat"], equipment: "machine" },
    { name: "45-Degree Back Extension", aliases: ["Dual 45° Hip Extension", "45 Degree Hip Extension"], equipment: "machine" },
    { name: "Glute Squat Machine", aliases: ["Glute Squat", "Precor Glute Squat"], equipment: "machine" },
  ];

  [
    ["Machine Belt Squat", "Belt Squat"],
    ["Pendulum Squat", "Pendulum Squat Machine"],
    ["Dual 45° Hip Extension", "45-Degree Back Extension"],
    ["Precor Glute Squat", "Glute Squat Machine"],
  ].forEach(([input, canonical]) => {
    assert.equal(matcher.recommendedLibraryMatch(input, library).exercise.name, canonical);
  });
});
