const assert = require("node:assert/strict");
const { test } = require("node:test");
const { snapshotWeeks } = require("../js/lifthardr-profile.js");

test("training snapshots aggregate each completed workout once and keep non-strength sets out of reps and volume", () => {
  const completed = { entry_date: "2026-11-19", session_id: "a", completed_at: "2026-11-19T00:00:00Z" };
  const rows = [
    { ...completed, workout_duration_seconds: 1200, reps: 5, weight_used: 80 },
    { ...completed, workout_duration_seconds: 1200, reps: 8, weight_used: 20 },
    { ...completed, workout_duration_seconds: 1200, reps: 20, weight_used: 70, set_type: "warm_up" },
    { ...completed, reps: 42, weight_used: 60, set_type: "timed" },
    { entry_date: "2026-11-15", workout_title: "Old workout", weight_used: 30, reps: 4 },
    { entry_date: "2026-11-19", session_id: "unfinished", weight_used: 200, reps: 20 },
    { ...completed, entry_date: "2026-11-22", session_id: "future", weight_used: 200, reps: 20 }
  ];
  const weeks = snapshotWeeks(rows, "2026-11-20", row => row.session_id || row.workout_title, row => !row.set_type);
  assert.equal(weeks.length, 12);
  assert.equal(new Date(weeks.at(-1).start).toISOString().slice(0, 10), "2026-11-16");
  assert.deepEqual([weeks.at(-1).duration, weeks.at(-1).volume, weeks.at(-1).reps], [20, 560, 13]);
  assert.deepEqual([weeks.at(-2).volume, weeks.at(-2).reps], [120, 4]);
});
