const assert = require("node:assert/strict");
const test = require("node:test");
const {timing, progress, logRow} = require("../js/client-hiit.js");

const plan = {type: "general", work: 2, rest: 1, rounds: 2, movements: ["Squat", "Push-up"]};
const session = {plan, runningSince: 0, accumulated: 0, endedAt: null};

test("existing HIIT round semantics omit rest after the final round", () => {
  assert.equal(timing(plan).total, 9);
  assert.equal(progress(session, 1999).movement, "Squat");
  assert.equal(progress(session, 2000).movement, "Push-up");
  assert.equal(progress(session, 4000).phase, "rest");
  assert.equal(progress(session, 4000).completed, 1);
  assert.equal(progress(session, 5000).round, 2);
  assert.equal(progress(session, 9000).phase, "finished");
  assert.equal(progress(session, 1000000).completed, 2);
});

test("pausing freezes the elapsed time and zero rest advances immediately", () => {
  const zeroRest = {...session, plan: {...plan, rest: 0}, runningSince: null, accumulated: 4000};
  const result = progress(zeroRest, 10000);
  assert.equal(result.completed, 1);
  assert.equal(result.round, 2);
  assert.equal(result.phase, "work");
  assert.equal(result.seconds, 4);
  assert.equal(result.paused, true);
  assert.equal(progress({...zeroRest, runningSince: 10000}, 12000).movement, "Push-up");
  assert.equal(timing({...plan, movements: Array(13).fill("Squat")}), null);
  assert.equal(timing({...plan, work: 600, rounds: 99, movements: ["Squat", "Push-up"]}), null);
});

test("completed sessions use native cardio metadata and stable distinct history identities", () => {
  const id = "63bc2fa0-c66a-48b0-839b-d31fb3888036";
  const setID = "70751a11-611f-4441-99b7-5b28416aa111";
  const start = Date.UTC(2026, 10, 27, 22);
  const completed = {...session, plan: {...plan, type: "rowing", work: 30}, id, setID,
    runningSince: null, accumulated: 60000, endedAt: start + 60000, entryDate: "2026-11-27"};
  const row = logRow(completed, " Demo@Example.Test ");
  assert.equal(row.workout_title, "Rowing HIIT · " + id);
  assert.equal(row.workout_template_id, "3593e1d7-4c7d-5bf0-938b-5da4257cc855");
  assert.equal(row.exercise_name, "Rowing");
  assert.equal(row.client_email, "demo@example.test");
  assert.equal(row.exercise_code, "CARDIO");
  assert.equal(row.set_type, "timed");
  assert.equal(row.duration_seconds, 60);
  assert.equal(row.workout_duration_seconds, 60);
  assert.equal(row.weight_used, 1);
  assert.equal(row.notes, "Cardio format: intervals\nWork: 30 seconds\nRest: 1 seconds\nRounds: 1\nStations: Squat | Push-up\nPlanned rounds: 2");
  assert.equal(row.session_id, id);
  assert.equal(row.set_id, setID);
  assert.equal(row.source, "website");
  assert.deepEqual(logRow(completed, "demo@example.test"), row);
  assert.match(logRow({...completed, plan}, "demo@example.test").workout_title, /^HIIT Workout/);
  assert.notEqual(logRow({...completed, id: setID}, "demo@example.test").workout_title, row.workout_title);
});
