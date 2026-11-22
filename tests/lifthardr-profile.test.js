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

const { currentPackBalance, copyOwnedPrograms } = require("../js/lifthardr-profile.js");
const client = { id: "synthetic-owner", email: "client@example.invalid" };
const identity = { user: client, ownerId: client.id, clientEmail: client.email };
const program = (options = {}) => ({
  id: "pack-a", client_email: client.email, active: true, client_archived: false,
  membership_type: "personal_training", account_type: "client", updated_at: "2026-11-20T08:00:00Z",
  created_at: "2026-11-01T08:00:00Z", session_count_total: 10, session_count_used: 7,
  ...options
});

test("private Profile session pack uses only strict owned active personal training rows, never sums or uses other memberships", () => {
  const rows = [
    program({ id: "other", client_email: "other@example.invalid", updated_at: "2026-11-24", session_count_used: 1 }),
    program({ id: "online", membership_type: "online_training", updated_at: "2026-11-25" }),
    program({ id: "app", membership_type: "app_access_only", updated_at: "2026-11-25" }),
    program({ id: "beta", account_type: "beta_tester", updated_at: "2026-11-25" }),
    program({ id: "archived", client_archived: true, updated_at: "2026-11-25" }),
    program({ id: "inactive", active: false, updated_at: "2026-11-25" }),
    program({ id: "old", updated_at: "2026-11-10", session_count_used: 0 }),
    program({ client_email: " CLIENT@EXAMPLE.INVALID " })
  ];
  assert.equal(currentPackBalance(rows, identity), 3);
  assert.equal(currentPackBalance(rows.slice(0, 6), identity), null);
  assert.equal(currentPackBalance([program({ session_count_used: 10 })], identity), 0);
  assert.equal(currentPackBalance([program({ session_count_used: 11 })], identity), 0);
  for (const extra of [{ user: null }, { ownerId: "wrong-id" }, { clientEmail: "someone@example.invalid" },
    { preview: true }, { isCoach: true }]) assert.equal(currentPackBalance(rows, { ...identity, ...extra }), null);
});

test("invalid latest eligible count hides instead of showing zero or falling back to an older pack", () => {
  const older = program({ id: "pack-old", updated_at: "2026-11-15" });
  for (const invalid of [undefined, null, "", "4", -1, 1.5, Infinity, NaN]) {
    assert.equal(currentPackBalance([older, program({ session_count_used: invalid })], identity), null);
  }
  for (const invalid of [undefined, null, 0, "10", -10, 2.5, Infinity]) {
    assert.equal(currentPackBalance([older, program({ session_count_total: invalid })], identity), null);
  }
  assert.equal(currentPackBalance([program({ id: "a" }), program({ id: "b", session_count_used: 8 })], identity), 2);
});

test("snapshot isolates the source from the legacy account-wide display mutation", () => {
  const inputs = [program()];
  const copy = copyOwnedPrograms(inputs, client.email);
  inputs[0].session_count_used = 1;
  assert.equal(currentPackBalance(copy, identity), 3);
  assert.notEqual(copy[0], inputs[0]);
});

test("Profile Training Snapshot range expands dynamically without excluding this week", () => {
  const today = "2026-11-20", none = [];
  const bins = [1, 3, 6].map(range => snapshotWeeks(none, today, () => "", () => true, range));
  assert.ok(bins[0].length < bins[1].length && bins[1].length < bins[2].length);
  assert.ok(bins.every(weeks => new Date(weeks.at(-1).start).toISOString().startsWith("2026-11-16")));
});
