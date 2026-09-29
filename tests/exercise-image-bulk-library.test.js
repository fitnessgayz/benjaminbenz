const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260929005612_link_bulk_exercise_images.sql"),
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
