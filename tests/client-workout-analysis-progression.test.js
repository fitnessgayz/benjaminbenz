const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalExerciseNames, prepare } = require("../js/client-workout-analysis-progression.js");

const owner = "client@example.invalid";
const displayName = "Dumbbell Shoulder Press";
const canonicalName = (name) => String(name || "").trim().toLowerCase().replace(/^db /, "dumbbell ");
const identity = (row) => row.session_id ? `session:${row.session_id}` : `legacy:${row.entry_date}::${row.workout_title}`;
const options = {
  owner,
  canonicalName,
  sessionKey: identity,
  sameGym: (left, right) => String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase(),
  historyComplete: true,
  now: new Date("2026-11-26T22:00:00Z")
};
const config = {
  enabled: true, exercise_key: "name:dumbbell shoulder press", rep_min: 8, rep_max: 12,
  planned_sets: 2, target_rir: 2, increment: 5, unit: "lb", required_sessions: 2
};

function session(id, date, changes = {}) {
  return [1, 2].map((set) => ({
    client_email: owner, session_id: id, entry_date: date, workout_title: "Full Body",
    completed_at: `${date}T17:00:00Z`, exercise_code: "A1", exercise_name: displayName, gym_name: "North Gym",
    set_type: "working", set_number: set, weight_used: 100, reps: 12, effort_scale: "rir", effort_value: 2,
    progression_target: config, ...changes
  }));
}

test("compares with the earlier alias at the same gym and uses the shared load progression", () => {
  const current = session("current", "2026-11-24");
  const previous = session("prior", "2026-11-20", { exercise_name: "DB Shoulder Press",
    progression_target: { ...config, exercise_key: "name:db shoulder press" } });
  const history = [
    ...current,
    ...previous,
    ...session("foreign", "2026-11-23", { client_email: "other@example.invalid", weight_used: 500 }),
    ...session("elsewhere", "2026-11-23", { gym_name: "South Gym", weight_used: 200 }),
    ...session("unstopped", "2026-11-23", { completed_at: null, weight_used: 400 }),
    ...session("different", "2026-11-23", { exercise_name: "Barbell Shoulder Press", weight_used: 400 }),
    ...session("later-on-same-day", "2026-11-24", { completed_at: "2026-11-24T19:00:00Z", weight_used: 600 }),
    ...session("later", "2026-11-25", { weight_used: 300 }),
    ...session("warm-up", "2026-11-23", { set_type: "warm_up", set_number: 1001, weight_used: 300 }),
    ...session("cardio", "2026-11-23", { exercise_code: "CARDIO", weight_used: 300 })
  ];
  const unchanged = structuredClone(history);
  const result = prepare(current, history, options)(current);
  assert.equal(result.kind, "increase");
  assert.deepEqual(result.thisWorkout, { weight: 100, reps: 12 });
  assert.deepEqual(result.previous, { date: "2026-11-20", weight: 100, reps: 12 });
  assert.deepEqual(result.targets, [{ setNumber: 1, weight: 105, reps: 8 }, { setNumber: 2, weight: 105, reps: 8 }]);
  assert.deepEqual(history, unchanged);
});

test("offers a rep first and keeps unverified prior loads out of the comparison", () => {
  const current = session("current", "2026-11-26", { reps: 10 });
  const invalid = session("prior", "2026-11-23", { weight_used: 0, reps: 50 });
  const result = prepare(current, invalid, options)(current);
  assert.equal(result.previous, null);
  assert.equal(result.kind, "reps");
  assert.deepEqual(result.targets, [{ setNumber: 1, weight: 100, reps: 11 }, { setNumber: 2, weight: 100, reps: 10 }]);
});

test("uses exact catalog names before aliases and never joins two machines through an ambiguous alias", () => {
  const resolve = canonicalExerciseNames([
    { name: "Plate-Loaded Shoulder Press", aliases: [displayName, "Machine Shoulder Press"] },
    { name: "Selectorized Shoulder Press", aliases: ["Machine Shoulder Press"] },
    { name: displayName, aliases: ["DB Shoulder Press"] }
  ], canonicalName);
  assert.equal(resolve(displayName), "dumbbell shoulder press");
  assert.equal(resolve("Machine Shoulder Press"), "");
  const plateLoaded = session("current", "2026-11-26", { exercise_name: "Plate-Loaded Shoulder Press",
    progression_target: { ...config, exercise_key: "name:plate-loaded shoulder press" } });
  const ambiguous = session("prior", "2026-11-22", { exercise_name: "Machine Shoulder Press",
    progression_target: { ...config, exercise_key: "name:machine shoulder press" } });
  const result = prepare(plateLoaded, ambiguous, { ...options, canonicalName: resolve })(plateLoaded);
  assert.equal(result.previous, null);
  assert.equal(result.kind, "hold");
  assert.equal(prepare(ambiguous, plateLoaded, { ...options, canonicalName: resolve })(ambiguous), null);
});

test("holds the load if a newer previous session does not establish comparable success", () => {
  const current = session("current", "2026-11-26");
  const earliest = session("older", "2026-11-20");
  const recentIncomplete = session("partial", "2026-11-23").slice(0, 1);
  const result = prepare(current, [...earliest, ...recentIncomplete], options)(current);
  assert.equal(result.kind, "hold");
  assert.equal(result.targets[0].weight, 100);
  assert.deepEqual(result.previous, { date: "2026-11-23", weight: 100, reps: 12 });
});

test("uses the earlier workout date for backfilled comparisons and holds the selected workout's recorded targets", () => {
  const current = session("current", "2026-11-24");
  const backfilled = session("backfill", "2026-11-23", { completed_at: "2026-11-25T17:00:00Z", weight_used: 110 });
  const older = session("older", "2026-11-22");
  const result = prepare(current, [...current, ...backfilled, ...older], options)(current);
  assert.deepEqual(result.previous, { date: "2026-11-23", weight: 110, reps: 12 });
  assert.equal(result.kind, "hold");
  assert.deepEqual(result.targets, [{ setNumber: 1, weight: 100, reps: 12 }, { setNumber: 2, weight: 100, reps: 12 }]);
});

test("uses actual working sets as a baseline when no training targets were recorded", () => {
  const current = session("current", "2026-11-26", { progression_target: null, reps: 10 });
  current[1].weight_used = 90;
  current[1].reps = 12;
  const model = prepare(current, [], options);
  assert.equal(model(current).kind, "baseline");
  assert.deepEqual(model(current).targets, [{ setNumber: 1, weight: 100, reps: 10 }, { setNumber: 2, weight: 90, reps: 12 }]);
  assert.deepEqual(model([current[1]]).targets, [], "A missing first set cannot become the target");
  const loading = prepare(current, [], { ...options, historyComplete: false });
  assert.deepEqual(loading(current).targets, []);
});

test("does not suggest targets for assisted, timed, bodyweight, disabled, or malformed plans", () => {
  for (const changes of [
    { exercise_name: "Assisted Pull-Up" }, { set_type: "timed", duration_seconds: 30 },
    { exercise_name: "Push-up", weight_used: 0 }, { exercise_code: "CARDIO" }
  ]) {
    const current = session("current", "2026-11-26", changes);
    assert.equal(prepare(current, [], options)(current), null);
  }
  for (const settings of [{ ...config, enabled: false }, { ...config, unit: "kg" }, { ...config, exercise_key: "name:barbell shoulder press" }, false]) {
    const current = session("current", "2026-11-26", { progression_target: settings });
    assert.deepEqual(prepare(current, [], options)(current).targets, []);
  }
});
