const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "../supabase/migrations/20261001025452_replace_exercise_videos.sql",
  ),
  "utf8",
);

test("one uploaded video is assigned to all three Bulgarian split-squat variants", () => {
  assert.match(migration, /'Bulgarian Split Squat'/);
  assert.match(migration, /'One Dumbbell Bulgarian Split Squat'/);
  assert.match(migration, /'Two Dumbbell Bulgarian Split Squat'/);
  assert.equal(
    (migration.match(/exercise-videos\/generated\/2026-09-30\/bulgarian-split-squat[.]mp4/g) || []).length,
    3,
  );
});

test("video assignment preserves each exercise's distinct static branded card", () => {
  assert.match(migration, /set\s+[\s\S]*motion_url\s*=/i);
  assert.doesNotMatch(migration, /image_url\s*=/i);
  assert.doesNotMatch(migration, /delete\s+from/i);
});

test("replacement migration assigns the supplied upright-row and incline-curl videos", () => {
  assert.match(migration, /'Barbell Upright Row'/);
  assert.match(migration, /'Upright Row'/);
  assert.match(migration, /'Incline Dumbbell Curl'/);
  assert.match(migration, /generated\/2026-09-30\/upright-row[.]mp4/);
  assert.match(migration, /generated\/2026-09-30\/incline-dumbbell-curl[.]mp4/);
});
