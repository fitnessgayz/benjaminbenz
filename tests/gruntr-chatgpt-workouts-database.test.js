const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
let PGlite;
try { ({ PGlite } = require(process.env.GRUNTR_PGLITE_PATH || "@electric-sql/pglite")); } catch {}
const alice = { sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "alice@example.test", client_id: randomUUID() };
const bob = { sub: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "bob@example.test", client_id: randomUUID() };
const aliceWeb = { sub: alice.sub, email: alice.email };
const bobWeb = { sub: bob.sub, email: bob.email };

async function bootstrap(db) {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; grant usage on schema auth to authenticated;
    create table auth.users (id uuid primary key);
    create table public.client_progress_photos (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid$$;`);
  for (const file of [
    "supabase/roles.sql",
    "supabase/migrations/20260812182704_benjamin_ai_coach.sql",
    "supabase/migrations/20260815025907_mcp_workout_logging.sql",
    "FWB-iOS-App/supabase/migrations/20260822010000_cross_platform_continuity.sql",
    "supabase/migrations/20260822053131_create_shared_exercise_library.sql",
    "FWB-iOS-App/supabase/migrations/20260822061040_add_workout_exercise_order.sql",
    "FWB-iOS-App/supabase/migrations/20260825132738_add_workout_session_feedback.sql",
    "supabase/migrations/20260827135607_coach_custom_workout_logger_policy.sql",
    "supabase/migrations/20260919000806_workout_energy_ratings.sql",
    "supabase/migrations/20260926003151_delete_client_workout_sessions.sql",
    "supabase/migrations/20260928165842_add_workout_progression_targets.sql",
    "supabase/migrations/20261003235720_add_workout_gym_location.sql",
    "supabase/migrations/20261004032702_client_saved_workout_plans.sql",
    "supabase/migrations/20261007002147_client_workout_plans_and_schedule.sql",
    "supabase/migrations/20261007003956_classify_saved_workout_plans.sql",
    "supabase/migrations/20261123035902_gruntr_chatgpt_workouts.sql",
  ]) {
    await db.exec(read(file).replace("create extension if not exists pgcrypto;", ""));
  }
  await db.query("insert into auth.users(id) values ($1),($2)", [alice.sub, bob.sub]);
  await db.exec(`create unique index synthetic_workout_natural_key
      on public.client_workout_logs(client_email, entry_date, workout_title, exercise_code, set_number);`);
}

const as = async (db, claims, sql, values = []) => {
  await db.exec(`begin; set local role ${claims ? "authenticated" : "anon"}`);
  try {
    if (claims) await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
    const { rows } = await db.query(sql, values);
    await db.exec("commit");
    return rows;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
};

const write = async (db, claims, action, requestId, input) => {
  const [row] = await as(db, claims, "select public.write_gruntr_workout($1,$2,$3) as value", [requestId, action, input]);
  return row.value;
};

test("two synthetic accounts load the real GRUNTR migration, exercise RLS and see one canonical history session", {
  skip: !PGlite && "Install @electric-sql/pglite or set GRUNTR_PGLITE_PATH",
}, async () => {
  const db = new PGlite();
  try {
    await bootstrap(db);
    const date = { occurred_on: "2026-11-01", workout_title: "Upper Body A" };
    const startId = randomUUID();
    await assert.rejects(write(db, null, "start", startId, date), /permission denied/);
    const draft = await write(db, alice, "start", startId, { ...date, client_email: bob.email, owner_id: bob.sub });
    const session = { session_id: draft.session_id };
    const set = { exercise_name: "Barbell Bench Press", reps: 10, weight_lb: 132.277357, unit: "kg",
      exercise_id: (await db.query("select id from exercise_library where name = 'Barbell Bench Press'")).rows[0].id,
      effort_scale: "rpe", effort_value: 8 };
    const firstId = randomUUID();
    const append = { ...session, set };
    const first = await write(db, alice, "append", firstId, append);
    assert.deepEqual(await write(db, alice, "append", firstId, append), { ...first, replayed: true });
    await assert.rejects(write(db, alice, "append", firstId, { ...append, set: { ...set, reps: 12 } }), /new request ID/);
    await assert.rejects(write(db, bob, "append", randomUUID(), append), /no longer active/);
    await assert.rejects(write(db, bob, "finish", randomUUID(), session), /no longer active/);
    assert.equal((await as(db, bob, "select session_id from public.client_workout_drafts")).length, 0);
    assert.equal((await as(db, alice, "select count(*)::int as count from public.client_workout_logs"))[0].count, 0);
    await assert.rejects(write(db, alice, "start", randomUUID(), date), /already have an active/);
    await assert.rejects(write(db, alice, "cancel", randomUUID(), session), /Only an empty/);
    await assert.rejects(write(db, alice, "append", randomUUID(), { ...session, set: { ...set, reps: -1 } }), /Invalid set/);

    const edit = { ...session, set_id: first.set_id, set: { reps: 9, notes: "Controlled." } };
    const editId = randomUUID();
    assert.equal((await write(db, alice, "edit", editId, edit)).set_id, first.set_id);
    assert.equal((await write(db, alice, "edit", editId, edit)).replayed, true);
    const second = await write(db, alice, "append", randomUUID(), append);
    assert.equal(second.set_number, 2);
    const bodyweight = await write(db, alice, "append", randomUUID(), { ...session, set: {
      exercise_name: "Push-up", reps: 12, bodyweight: true, effort_scale: "rir", effort_value: 2,
    } });
    const finishId = randomUUID();
    const saved = await write(db, alice, "finish", finishId, session);
    assert.equal(saved.sets, 3);
    assert.deepEqual(await write(db, alice, "finish", finishId, session), { ...saved, replayed: true });
    assert.equal((await as(db, alice, "select session_id from public.client_workout_drafts")).length, 0);
    assert.equal((await as(db, bob, "select id from public.client_workout_logs")).length, 0);
    assert.equal((await as(db, bob, "update public.client_workout_logs set reps=99 where session_id=$1 returning id", [saved.session_id])).length, 0);
    await assert.rejects(as(db, bob, "insert into public.client_workout_logs (client_email) values ($1)", [alice.email]), /row-level security/);

    // Exercise the dashboard's actual history key with canonical database rows.
    const columns = read("mcp-server/src/gruntr-workouts.ts").match(/const historyColumns = "([^"]+)"/)[1];
    const records = await as(db, aliceWeb, "select client_email,workout_session_id," + columns.replace("workout_session_id,", "")
      + " from public.client_workout_logs order by exercise_order,set_number");
    const portal = read("js/client-portal.js");
    const webKey = vm.runInNewContext(`(${portal.match(/function clientWorkoutHistorySessionKey\(record = \{\}\) \{[\s\S]+?\n\}/)[0]})`);
    assert.equal(new Set(records.map(webKey)).size, 1);
    assert.equal(webKey(records[0]), `session:${draft.session_id}`);
    assert.deepEqual(records.map((r) => [r.set_id, Number(r.reps)]), [[first.set_id, 9], [second.set_id, 10], [bodyweight.set_id, 12]]);
    assert.deepEqual(records.map((r) => r.workout_session_id), records.map((r) => r.session_id));
    assert.ok(records.every((r) => r.completed_at && r.id && r.client_email === alice.email));
    assert.equal(records[0].gruntr_load_unit, "kg");
    assert.equal(Number(records[0].weight_used), 132.277357);
    assert.equal(Number(records[2].weight_used), 0);
    assert.equal(records[2].gruntr_bodyweight, true);
    assert.match(records[2].notes, /Bodyweight/);
    if (process.env.GRUNTR_TEST_EXPORT) fs.writeFileSync(process.env.GRUNTR_TEST_EXPORT, JSON.stringify(records));

    const completeId = randomUUID();
    const complete = { ...date, sets: [{ ...set, exercise_order: 0, exercise_code: "A", set_number: 1 }] };
    const whole = await write(db, alice, "complete", completeId, complete);
    assert.equal(whole.sets, 1);
    assert.notEqual(whole.session_id, saved.session_id);
    assert.equal(whole.title, "Upper Body A (2)");
    assert.deepEqual(await write(db, alice, "complete", completeId, complete), { ...whole, replayed: true });

    // Both accounts may safely pick the same client request UUID.
    const bobDraft = await write(db, bob, "start", startId, date);
    assert.equal(bobDraft.state, "active");
    assert.equal((await write(db, bob, "cancel", randomUUID(), { session_id: bobDraft.session_id })).state, "canceled");
    assert.equal((await as(db, alice, "select session_id from public.client_workout_drafts")).length, 0);
  } finally {
    await db.close();
  }
});

test("routine preview keeps a plan unchanged until the owner approves in GRUNTR", {
  skip: !PGlite && "Install @electric-sql/pglite or set GRUNTR_PGLITE_PATH",
}, async () => {
  const db = new PGlite();
  try {
    await bootstrap(db);
    const id = randomUUID();
    const plan = { source: "gruntr_chatgpt", version: 1, title: "Upper/Lower", customTitle: "Upper/Lower", days: 2, minutes: 45,
      answers: { daysPerWeek: 2, goal: "muscle", focus: "balanced", experience: "regular", minutes: 45, equipment: ["barbell"] },
      workouts: [0, 3].map((weekday) => ({ title: "Day " + weekday, exercises: [{ name: "Barbell Bench Press", prescription: "8-12 reps x 3 sets" }] })),
      sessions: [0, 3].map((weekday) => ({ weekday, launch: { id: randomUUID(), title: "Day " + weekday,
        estimatedMinutes: 45, exercises: [{ code: "A", name: "Barbell Bench Press", prescription: "8-12 reps x 3 sets", rest: "90 sec", video: "" }] } })),
    };
    const query = "select public.propose_gruntr_routine($1,$2,$3) as value";
    const [preview] = await as(db, alice, query, [id, plan, null]);
    assert.equal(preview.value.state, "awaiting_approval");
    assert.deepEqual((await as(db, alice, query, [id, plan, null]))[0], preview);
    const lookup = "select public.get_gruntr_routine_proposal($1) as value";
    assert.equal((await as(db, bob, lookup, [id]))[0].value, null);
    assert.equal((await as(db, alice, "select id from public.client_saved_workout_plans")).length, 0);
    const approve = "select public.approve_gruntr_routine($1) as value";
    await assert.rejects(as(db, alice, approve, [id]), /from your GRUNTR dashboard/);
    await assert.rejects(as(db, bobWeb, approve, [id]), /preview not found/);
    const [receipt] = await as(db, aliceWeb, approve, [id]);
    assert.equal(receipt.value.state, "saved");
    assert.deepEqual((await as(db, aliceWeb, approve, [id]))[0], receipt);
    assert.deepEqual((await as(db, alice, lookup, [id]))[0], receipt);
    assert.equal((await as(db, bob, "select id from public.client_saved_workout_plans")).length, 0);
    const [saved] = await as(db, aliceWeb, "select id, plan, snapshot_json from public.client_saved_workout_plans");
    assert.equal(saved.id, receipt.value.plan_id);
    assert.equal(JSON.parse(saved.snapshot_json).id, saved.id);
    assert.ok(Number.isFinite(saved.plan.createdAt));
    assert.ok(saved.plan.sessions.every(({ launch }) => Number.isFinite(launch.createdAt)));
    if (process.env.GRUNTR_TEST_PLAN_EXPORT) fs.writeFileSync(process.env.GRUNTR_TEST_PLAN_EXPORT, saved.snapshot_json);

    const editId = randomUUID();
    const update = { ...plan, title: "Updated split" };
    await assert.rejects(as(db, bob, query, [editId, update, saved.id]), /Choose a saved weekly routine/);
    const [edit] = await as(db, alice, query, [editId, update, saved.id]);
    assert.equal(edit.value.previous_title, plan.title);
    assert.deepEqual(edit.value.before, plan.workouts);
    await as(db, aliceWeb, "update public.client_saved_workout_plans set title='Changed on phone' where id=$1", [saved.id]);
    await assert.rejects(as(db, aliceWeb, approve, [editId]), /saved routine changed/);
    const retryId = randomUUID();
    await as(db, alice, query, [retryId, update, saved.id]);
    const [updated] = await as(db, aliceWeb, approve, [retryId]);
    assert.equal(updated.value.plan_id, saved.id);
    assert.equal(updated.value.title, update.title);
    assert.equal((await as(db, alice, "select id from public.client_saved_workout_plans")).length, 1);
  } finally {
    await db.close();
  }
});
