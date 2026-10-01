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

const mp4Migration = fs.readFileSync(
  path.join(
    __dirname,
    "../supabase/migrations/20260930005745_allow_mp4_exercise_motion.sql",
  ),
  "utf8",
);

test("exercise motion is a separate optional WebP field", () => {
  assert.match(migration, /add column if not exists motion_url text/i);
  assert.match(migration, /motion_url is null/i);
  assert.match(migration, /exercise-images\/approved\/[a-z0-9/\-\[\].+*?$^(){}|\\]+webp/i);
  assert.doesNotMatch(migration, /\.(mp4|mov|m4v)/i);
});

test("motion migration does not replace existing static artwork", () => {
  assert.doesNotMatch(migration, /update\s+public\.exercise_library/i);
  assert.doesNotMatch(migration, /drop\s+(column|constraint)/i);
});

test("follow-up migration permits generated silent MP4 motion previews", () => {
  assert.match(mp4Migration, /drop constraint if exists exercise_library_motion_url_check/i);
  assert.match(mp4Migration, /exercise-videos\/generated\/[a-z0-9/\-\[\].+*?$^(){}|\\]+mp4/i);
  assert.match(mp4Migration, /animated WebP or silent MP4/i);
  assert.doesNotMatch(mp4Migration, /update\s+public\.exercise_library/i);
});
