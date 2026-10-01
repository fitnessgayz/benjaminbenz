const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const imagePath = path.join(root, "images/exercises/hip-abduction-machine-start-end.png");
const imageUrl = "https://benjaminbenz.com/images/exercises/hip-abduction-machine-start-end.png";
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260928223428_correct_hip_abduction_machine_image_field.sql"),
  "utf8"
);
const adminHtml = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const adminSource = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const portalSource = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

test("the seated hip abduction start/end PNG is checked in as the exercise asset", () => {
  const image = fs.readFileSync(imagePath);
  assert.equal(image.subarray(1, 4).toString(), "PNG");
  assert.ok(image.length > 100_000);
});

test("the migration changes only the existing exercise image reference", () => {
  assert.match(migration, /where id = 'a1f8eb80-c6d0-44a7-8e5b-237333b651df'/);
  assert.match(migration, /and name = 'Hip Abduction Machine'/);
  assert.match(migration, new RegExp(imageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(migration, /set demo_url = null,\s*image_url =/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.exercise_library/i);
  assert.doesNotMatch(migration, /set[\s\S]*updated_at\s*=/i);
});

test("coach and client exercise views recognize and preview the trusted image", () => {
  assert.match(adminHtml, /id="exercise-library-image-preview"/);
  assert.match(adminSource, /Exercise image attached\./);
  assert.match(adminSource, /record\.image_url/);
  assert.match(portalSource, /approvedExerciseForName\(exercise\.name\)\?\.image_url/);
  assert.match(portalSource, /class="exercise-demo-image"/);
  assert.match(portalSource, /\.select\("[^"]*image_url/);
});
