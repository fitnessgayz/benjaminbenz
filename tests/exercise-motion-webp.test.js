const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "../supabase/migrations/20260929151627_add_exercise_motion_webp.sql",
  ),
  "utf8",
);

test("exercise motion is a separate optional WebP field", () => {
  assert.match(migration, /add column motion_url text/i);
  assert.match(migration, /motion_url is null/i);
  assert.match(migration, /exercise-images\/approved\/[a-z0-9/\-\[\].+*?$^(){}|\\]+webp/i);
  assert.doesNotMatch(migration, /\.(mp4|mov|m4v)/i);
});

test("motion migration does not replace existing static artwork", () => {
  assert.doesNotMatch(migration, /update\s+public\.exercise_library/i);
  assert.doesNotMatch(migration, /drop\s+(column|constraint)/i);
});
