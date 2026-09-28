const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../js/workout-progression.js");
const fixtures = require("./fixtures/workout-progression.json");

for (const fixture of fixtures.cases) {
  test(`shared iOS/web progression: ${fixture.name}`, () => {
    const input = structuredClone(fixture.input);
    assert.deepEqual(engine.recommend(input), fixture.expected);
    assert.deepEqual(input, fixture.input, "Suggestions must not mutate actual workout history or saved plans.");
  });
}

test("publishes one engine for browser and CommonJS consumers", () => {
  assert.equal(globalThis.FWB_WORKOUT_PROGRESSION, engine);
});

test("exact exercise identity keeps punctuation and equipment distinct", () => {
  assert.equal(engine.exerciseKey("  Seated   Dumbbell Press\n"), "name:seated dumbbell press");
  assert.notEqual(engine.exerciseKey("Dumbbell press"), engine.exerciseKey("Barbell press"));
  assert.notEqual(engine.exerciseKey("Press (machine A)"), engine.exerciseKey("Press (machine B)"));
  assert.equal(engine.exerciseKey(null), "");
});

test("default targets come only from unambiguous rep prescriptions", () => {
  for (const prescription of ["8–12 reps x 3 sets", "8–12 x 3 sets", "3 × 8–12", "3 sets of 8-12 reps", "8-12 reps x 3 sets per side"]) {
    assert.deepEqual(engine.deriveConfig({ name: "Dumbbell Shoulder Press", prescription }), fixtures.cases[0].input.config);
  }
  assert.equal(engine.deriveConfig({ name: "Press", prescription: "8-12 reps" }, 4).planned_sets, 4);
  for (const prescription of ["3 sets", "3 x 30 sec", "AMRAP", "3 × 8 at 40 lb", "4 rounds of 30 sec/side", "8 / 10 / 12", "", "12-8 reps x 3 sets"]) {
    assert.equal(engine.deriveConfig({ name: "Press", prescription }), null, prescription);
  }
  for (const name of ["Push-up", "Assisted Pull-Up", "Front Plank", "Glute Bridge", "Mobility Press"]) {
    assert.equal(engine.deriveConfig({ name, prescription: "3 x 8-12" }), null, name);
  }
  assert.ok(engine.deriveConfig({ name: "Weighted Pull-Up", prescription: "3 x 8-12" }));
});

test("explicit coach configuration takes precedence and malformed settings never re-enable defaults", () => {
  const progression = { ...fixtures.cases[0].input.config, enabled: false, increment: 1.25, unit: "kg" };
  const exercise = { name: "Dumbbell Shoulder Press", prescription: "3 x 8-12", progression };
  assert.deepEqual(engine.deriveConfig(exercise), progression);
  assert.deepEqual(engine.deriveConfig(exercise, 4), { ...progression, planned_sets: 4 });
  assert.equal(engine.deriveConfig({ ...exercise, progression: { enabled: false } }), null);
  assert.equal(engine.deriveConfig({ ...exercise, name: "Barbell Shoulder Press" }), null);
  assert.deepEqual(exercise.progression, progression);
});

test("invalid config fields fail closed instead of coercing numbers or inventing a plan", () => {
  const config = fixtures.cases[0].input.config;
  for (const change of [
    { enabled: "true" }, { exercise_key: "A1" }, { exercise_key: "name: Press" }, { exercise_key: "name:" },
    { rep_min: 0 }, { rep_min: "8" }, { rep_max: 51 }, { planned_sets: 0 }, { planned_sets: 21 },
    { target_rir: -1 }, { target_rir: 6 }, { target_rir: NaN }, { increment: Infinity }, { increment: 0 },
    { increment: 101 }, { unit: "lbs" }, { required_sessions: 1 }, { required_sessions: 6 }
  ]) assert.equal(engine.recommend({ config: { ...config, ...change } }).kind, "unavailable", JSON.stringify(change));
  const { required_sessions, ...oldConfig } = config;
  assert.equal(engine.normalizeConfig(oldConfig).required_sessions, 2);
});

test("malformed history cannot produce recommendations", () => {
  const input = fixtures.cases.find(({ expected }) => expected.kind === "increase").input;
  assert.equal(engine.recommend({ ...input, history: null }).kind, "unavailable");
  assert.equal(engine.recommend({ ...input, now: "not a date" }).kind, "unavailable");
  for (const change of [{ reps: NaN }, { reps: "12" }, { weight_used: Infinity }, { weight_used: -10 }, { set_number: 1.5 }]) {
    const history = input.history.map((row) => ({ ...row, ...change }));
    assert.equal(engine.recommend({ ...input, history }).kind, "baseline");
  }
});

test("success ordering is independent of input row order", () => {
  for (const fixture of fixtures.cases) {
    assert.deepEqual(engine.recommend({ ...fixture.input, history: [...fixture.input.history].reverse() }), fixture.expected, fixture.name);
  }
});
