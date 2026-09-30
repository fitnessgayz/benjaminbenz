const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "../supabase/migrations/20260930180001_assign_bulgarian_split_squat_video.sql",
  ),
  "utf8",
);

test("one uploaded video is assigned to all three Bulgarian split-squat variants", () => {
  assert.match(migration, /'Bulgarian Split Squat'/);
  assert.match(migration, /'One Dumbbell Bulgarian Split Squat'/);
  assert.match(migration, /'Two Dumbbell Bulgarian Split Squat'/);
  assert.match(migration, /'Bulgarian Split Squat One Arm Dumbbell'/);
  assert.match(migration, /'Bulgarian Split Squat Two Arm Dumbbell'/);
  assert.equal(
    (migration.match(/exercise-videos\/generated\/bulgarian-split-squat[.]mp4/g) || []).length,
    1,
  );
});

test("video assignment preserves each exercise's distinct static branded card", () => {
  assert.match(migration, /set\s+[\s\S]*motion_url\s*=/i);
  assert.doesNotMatch(migration, /image_url\s*=/i);
  assert.doesNotMatch(migration, /delete\s+from/i);
});
