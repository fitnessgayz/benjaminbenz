const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const engine = require("../js/daily-workout-recommendation.js");

const email = "client@example.com";
const date = "2026-09-25";
const ready = { mood: 4, energy: 4, sleep: 4, soreness: 2 };
const makeExercise = (overrides = {}) => ({
  code: "A1", name: "Goblet squat", prescription: "8–10 reps x 3 sets", sets: 3,
  rest: "60 sec", instructions: ["Keep a controlled tempo."], video: "https://example.com/squat", ...overrides
});
const makeWorkout = (overrides = {}) => ({ title: "Strength A", focus: "Legs", format: "superset", exercises: [makeExercise()], ...overrides });
const makeProgram = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", client_email: email,
  workouts: [makeWorkout(), makeWorkout({ title: "Strength B" })], ...overrides
});
const build = (overrides = {}) => engine.recommend({ program: makeProgram(), history: [], date, clientEmail: email, checkIn: ready, ...overrides });
const log = (overrides = {}) => ({ client_email: email, entry_date: "2026-09-24", workout_title: "Strength A", exercise_code: "A1", reps: 8, completed_at: "2026-09-24T16:00:00Z", ...overrides });
const note = "Mood: 4/5 · Energy: 4/5 · Sleep: 4/5 · Eating: 3/5 · Body: 4/5 · Note: Feeling good.";

function nativeUUID(namespace, name) {
  const bytes = crypto.createHash("sha256").update(`${namespace}|${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

test("publishes the browser and CommonJS API and parses the saved web check-in", () => {
  assert.equal(globalThis.FWB_DAILY_WORKOUT, engine);
  assert.deepEqual(engine.parseCheckIn(note), { ...ready, note: "Feeling good." });
  assert.deepEqual(engine.parseCheckIn("Mood: 1/5 · Energy: 2/5 · Sleep: 3/5 · Body: 1/5"), { mood: 1, energy: 2, sleep: 3, soreness: 5 });
});

test("does not discover ratings inside arbitrary notes, duplicates, malformed or incomplete check-ins", () => {
  for (const value of [null, "Great day", "Mood: Fine · Energy: 4/5 · Sleep: 4/5 · Body: 4/5", "Mood: 6/5 · Energy: 4/5 · Sleep: 4/5 · Body: 4/5",
    "Note: Mood: 4/5 · Energy: 4/5 · Sleep: 4/5 · Body: 4/5", "Mood: 4/5 · Note: Energy: 4/5 · Sleep: 4/5 · Body: 4/5",
    "Mood: 4/5 · Mood: 1/5 · Energy: 4/5 · Sleep: 4/5 · Body: 4/5", "Mood: 4/5 · Energy: 4/5 · Body: 4/5"]) {
    assert.equal(engine.parseCheckIn(value), null, value);
  }
  assert.deepEqual(engine.parseCheckIn(note + " · Mood: 1/5"), { ...ready, note: "Feeling good. · Mood: 1/5" });
});

test("daily saved gating uses the entry day and an actual check-in rather than every progress note", () => {
  assert.equal(engine.hasCheckIn({ entry_date: date, goal_note: note }, date), true);
  assert.equal(engine.hasCheckIn({ entry_date: date, goal_note: "Measured waist today" }, date), false);
  assert.equal(engine.hasCheckIn({ entry_date: date, mood_checkin_submitted_at: "2026-09-25T17:00:00Z" }, date), true);
  assert.equal(engine.hasCheckIn({ entry_date: date, mood_checkin_submitted_at: "invalid" }, date), false);
  assert.equal(engine.hasCheckIn({ entry_date: "2026-09-24", goal_note: note }, date), false);
  assert.equal(engine.hasCheckIn({ entry_date: "2026-02-30", goal_note: note }, "2026-02-30"), false);
});

test("ready clients keep the assigned workout exactly and can use its original index", () => {
  const program = makeProgram();
  const result = build({ program });
  assert.equal(result.level, "planned");
  assert.equal(result.workout, program.workouts[0]);
  assert.equal(result.originalWorkout, program.workouts[0]);
  assert.equal(result.workoutIndex, 0);
  assert.equal(result.originalIndex, 0);
  assert.equal(result.date, date);
});

test("energy, recovery score, soreness and mood select the expected native readiness levels", () => {
  const cases = [
    [{ energy: 1 }, "recovery"], [{ sleep: 1 }, "recovery"], [{ soreness: 5 }, "recovery"],
    [{ energy: 2, sleep: 2, soreness: 2 }, "recovery"], // 8/15 rounds to 53.
    [{ energy: 3, sleep: 3, soreness: 3 }, "lighter"], // 9/15 is 60.
    [{ energy: 3, sleep: 4, soreness: 2 }, "lighter"], // 11/15 rounds to 73.
    [{ energy: 4, sleep: 4, soreness: 2 }, "planned"], // 12/15 is 80.
    [{ mood: 1, energy: 5, sleep: 5, soreness: 1 }, "lighter"],
    [{ energy: 2, sleep: 5, soreness: 1 }, "lighter"],
    [{ energy: 5, sleep: 2, soreness: 1 }, "lighter"],
    [{ energy: 5, sleep: 5, soreness: 4 }, "lighter"]
  ];
  for (const [ratings, level] of cases) assert.equal(build({ checkIn: { ...ready, ...ratings } }).level, level, JSON.stringify(ratings));
});

test("a low mood alone suggests a shorter session without diagnosing low physical recovery", () => {
  const result = build({ checkIn: { mood: 1, energy: 5, sleep: 5, soreness: 1 } });
  assert.equal(result.level, "lighter");
  assert.deepEqual(result.reasons, ["You reported a lower mood, so a shorter session may feel more manageable."]);
});

test("requires all four actual answers and a real local calendar date", () => {
  for (const checkIn of [null, {}, { ...ready, mood: undefined }, { ...ready, energy: NaN }, { ...ready, sleep: 3.5 }, { ...ready, soreness: 0 }, { ...ready, mood: "4" }]) {
    assert.throws(() => build({ checkIn }), /Answer mood/);
  }
  for (const invalid of [undefined, "", "2026-02-30", "2026-9-25", "2026-09-25T00:00:00Z"]) assert.throws(() => build({ date: invalid }), /valid date/);
});

test("lighter copies reduce explicit counts without changing grouping, target reps, rest, cues or videos", () => {
  const exercises = [
    makeExercise({ group: 0, groupType: "superset" }),
    makeExercise({ code: "A2", name: "Romanian deadlift", prescription: "3 × 8 at 40 lb", group: 0, groupType: "superset" }),
    makeExercise({ code: "B1", name: "Circuit row", prescription: "4 rounds of 30 sec/side", group: 1, sets: 4 })
  ];
  const program = makeProgram({ workouts: [makeWorkout({ exercises })] });
  const snapshot = structuredClone(program);
  const result = build({ program, checkIn: { ...ready, mood: 2 } });
  assert.equal(result.workoutIndex, null);
  assert.equal(result.originalIndex, 0);
  assert.deepEqual(result.workout.exercises.map((exercise) => exercise.prescription), ["8–10 reps x 2 sets", "2 × 8 at 40 lb", "3 rounds of 30 sec/side"]);
  assert.deepEqual(result.workout.exercises.map((exercise) => exercise.sets), [2, 2, 3]);
  result.workout.exercises.forEach((exercise, index) => {
    for (const key of ["code", "name", "group", "groupType", "rest", "instructions", "video"]) assert.deepEqual(exercise[key], exercises[index][key]);
  });
  assert.equal(result.workout.format, "superset");
  assert.deepEqual(program, snapshot);
  assert.notEqual(result.workout, program.workouts[0]);
});

test("preparation, ambiguous prescriptions, fractional counts and one-set work remain intact", () => {
  const prescriptions = ["1 set of 8 reps", "3-4 sets x 10", "3–4 sets x 10", "2.5 sets x 10", "8–12 reps", "AMRAP", "13 sets of 5", "2 sets warm-up, 3 sets working"];
  const exercises = prescriptions.map((prescription, index) => makeExercise({ code: `B${index + 1}`, prescription }));
  exercises.push(makeExercise({ code: "WARMUP", name: "Bike", prescription: "3 rounds of 30 sec" }),
    makeExercise({ code: "X1", name: "Cool-down walk", prescription: "2 sets of 30 sec" }));
  const result = build({ program: makeProgram({ workouts: [makeWorkout({ exercises })] }), checkIn: { ...ready, mood: 2 } });
  assert.deepEqual(result.workout.exercises.map((exercise) => exercise.prescription), exercises.map((exercise) => exercise.prescription));
});

test("daily custom identities match native SHA-256 UUIDs, including workouts without supplied IDs", () => {
  for (const title of ["Strength A", "Mobilité – 🧘", "Long " + "routine ".repeat(40)]) {
    const workout = makeWorkout({ title });
    const program = makeProgram({ workouts: [workout] });
    const sourceID = nativeUUID("fwb-workout-template-v1", [title, workout.focus, workout.format].join("|").toLowerCase());
    const expected = nativeUUID("fwb-daily-check-in-workout-v1", [email, date, program.id, sourceID].join("|"));
    const result = build({ program, checkIn: { ...ready, mood: 2 } });
    assert.equal(result.workout.id, expected);
    assert.equal(result.workout.title, `Custom workout · Today: ${title} · ${expected}`);
  }
});

test("supplied native IDs and client/program/day differences produce isolated daily sessions", () => {
  const program = makeProgram({ workouts: [makeWorkout({ id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" })] });
  const result = build({ program, clientEmail: ` ${email.toUpperCase()} `, checkIn: { ...ready, mood: 2 } });
  const expected = nativeUUID("fwb-daily-check-in-workout-v1", [email, date, program.id, program.workouts[0].id.toLowerCase()].join("|"));
  assert.equal(result.workout.id, expected);
  const again = build({ program, checkIn: { ...ready, mood: 1 } });
  assert.equal(again.workout.id, expected);
  assert.notEqual(build({ program, date: "2026-09-26", checkIn: { ...ready, mood: 2 } }).workout.id, expected);
  assert.notEqual(build({ program: { ...program, id: "22222222-2222-4222-8222-222222222222" }, checkIn: { ...ready, mood: 2 } }).workout.id, expected);
  assert.notEqual(build({ program: { ...program, client_email: "other@example.com" }, clientEmail: "other@example.com", checkIn: { ...ready, mood: 2 } }).workout.id, expected);
});

test("recovery chooses only an explicitly assigned mobility routine and returns its usable index", () => {
  const recovery = makeWorkout({ title: "Easy mobility", format: "mobility" });
  const program = makeProgram({ workouts: [makeWorkout(), recovery] });
  const result = build({ program, checkIn: { ...ready, energy: 1 } });
  assert.equal(result.level, "recovery");
  assert.equal(result.workout, recovery);
  assert.equal(result.workoutIndex, 1);
  assert.equal(result.originalWorkout, program.workouts[0]);
  assert.equal(result.originalIndex, 0);
});

test("incidental mobility wording does not relabel a strength routine as recovery", () => {
  const program = makeProgram({ workouts: [makeWorkout({ title: "Strength + mobility" })] });
  const result = build({ program, checkIn: { ...ready, soreness: 5 } });
  assert.equal(result.workout, null);
  assert.equal(result.workoutIndex, null);
  assert.equal(result.originalWorkout, program.workouts[0]);
  assert.deepEqual(result.generatorPreferences, { focus: "recovery_full", minutes: 20, intensity: "easy" });
});

test("missing or another client's program gives the appropriate generator fallback", () => {
  for (const program of [null, makeProgram({ workouts: [] }), makeProgram({ workouts: [makeWorkout({ exercises: [] })] }), makeProgram({ client_email: "other@example.com" })]) {
    const result = build({ program });
    assert.equal(result.workout, null);
    assert.equal(result.originalWorkout, null);
    assert.equal(result.originalIndex, null);
    assert.deepEqual(result.generatorPreferences, { focus: "full_body", minutes: 30, intensity: "moderate" });
  }
  assert.deepEqual(build({ program: null, checkIn: { ...ready, mood: 2 } }).generatorPreferences, { focus: "full_body", minutes: 20, intensity: "easy" });
});

test("rotates from the latest completed assigned session while ignoring future and unrelated records", () => {
  const result = build({ history: [log(), log({ entry_date: "2026-09-26", workout_title: "Strength B" }), log({ workout_title: "Unrelated custom workout", entry_date: date })] });
  assert.equal(result.workout.title, "Strength B");
  assert.equal(result.workoutIndex, 1);
  assert.equal(build({ history: [log({ workout_title: "Strength B" })] }).workoutIndex, 0);
});

test("same-day completion keeps today's source instead of assigning a second workout", () => {
  assert.equal(build({ history: [log({ entry_date: date, completed_at: "2026-09-25T16:00:00Z" })] }).workoutIndex, 0);
});

test("modern unfinished sessions never advance the rotation, including null session identity columns", () => {
  for (const identity of [{ session_id: "session-a" }, { workout_session_id: "session-a" }, { session_id: null }, { fwb_session_identity_known: true }]) {
    assert.equal(build({ history: [log({ ...identity, completed_at: null })] }).workoutIndex, 0);
  }
  assert.equal(build({ history: [log({ session_id: "completed", workout_title: "Strength B" }), log({ session_id: "unfinished", completed_at: null, entry_date: date })] }).workoutIndex, 0);
});

test("legacy entered working/cardio records rotate but warm-up-only or empty records do not", () => {
  assert.equal(build({ history: [log({ completed_at: null })] }).workoutIndex, 1);
  assert.equal(build({ history: [log({ completed_at: null, session_id: null, fwb_session_identity_known: false })] }).workoutIndex, 1);
  assert.equal(build({ history: [log({ completed_at: null, reps: null, duration_seconds: 30 })] }).workoutIndex, 1);
  assert.equal(build({ history: [log({ completed_at: null, reps: null, exercise_code: "CARDIO" })] }).workoutIndex, 1);
  for (const override of [{ reps: null }, { set_type: "warm_up" }, { set_number: 1001 }, { exercise_code: "WARMUP" }]) {
    assert.equal(build({ history: [log({ ...override, completed_at: null })] }).workoutIndex, 0);
  }
});

test("completion on any row selects its session and later completion wins on a shared day", () => {
  assert.equal(build({ history: [log({ session_id: "one", completed_at: null }), log({ session_id: "one", exercise_code: "A2" })] }).workoutIndex, 1);
  assert.equal(build({ history: [log(), log({ workout_title: "Strength B", completed_at: "2026-09-24T18:00:00Z" })] }).workoutIndex, 0);
});

test("history from a different client, program or explicit template cannot drive this program", () => {
  for (const override of [{ client_email: "other@example.com" }, { program_id: "different-program" }, { workout_template_id: "99999999-9999-4999-8999-999999999999" }]) {
    assert.equal(build({ history: [log(override)] }).workoutIndex, 0);
  }
  assert.equal(build({ history: [log({ client_email: ` ${email.toUpperCase()} ` })] }).workoutIndex, 1);
});

test("adjusted web/native daily sessions rotate from their source, and same-day reopening stays put", () => {
  const yesterday = build({ date: "2026-09-24", checkIn: { ...ready, mood: 2 } });
  assert.equal(build({ history: [log({ workout_title: yesterday.workout.title })] }).workoutIndex, 1);
  assert.equal(build({ history: [log({ workout_title: yesterday.workout.title, workout_template_id: yesterday.workout.id })] }).workoutIndex, 1);
  const today = build({ checkIn: { ...ready, mood: 2 } });
  assert.equal(build({ history: [log({ entry_date: date, workout_title: today.workout.title, completed_at: "2026-09-25T18:00:00Z" })] }).workoutIndex, 0);
  assert.equal(build({ history: [log({ workout_title: yesterday.workout.title.replace(/.$/, "f") })] }).workoutIndex, 0);
});

test("empty assigned workouts are skipped while public indices stay aligned with the original list", () => {
  const program = makeProgram({ workouts: [makeWorkout({ title: "Draft", exercises: [] }), makeWorkout(), makeWorkout({ title: "Strength B" })] });
  assert.equal(build({ program }).workoutIndex, 1);
  assert.equal(build({ program, history: [log()] }).workoutIndex, 2);
});
