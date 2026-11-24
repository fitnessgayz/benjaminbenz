const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let PGlite;
try {
  ({ PGlite } = require(process.env.ACTIVITY_LIKES_PGLITE_PATH || "@electric-sql/pglite"));
} catch {}

const migration = fs.readFileSync(path.join(__dirname,
  "../supabase/migrations/20261124185622_coach_alex_fitness_session_history.sql"), "utf8");
const coachHelper = fs.readFileSync(path.join(__dirname,
  "../supabase/migrations/20260812182704_benjamin_ai_coach.sql"), "utf8")
  .match(/create or replace function public\.is_coach_admin\(\)[\s\S]*?\$\$;/)[0];

const row = (p, n, date = "2024-11-12", time = null) => ({
  package_number: p, session_number: n, session_date: date, start_time: time
});

test("Alex Fitness imports one sorted coach-only snapshot and preserves blank start times", {
  skip: !PGlite && "Install @electric-sql/pglite or set ACTIVITY_LIKES_PGLITE_PATH"
}, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      grant usage on schema auth to authenticated;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('email', current_setting('request.jwt.claim.email', true))
      $$;
      ${coachHelper}
      ${migration}
    `);
    const write = async (entries, checkedAt = "2024-11-13T06:00:00Z") =>
      (await db.query("select public.save_coach_alex_fitness_history($1, $2::jsonb) as changed",
        [checkedAt, JSON.stringify(entries)])).rows[0].changed;
    const read = () => db.query("select sessions from public.coach_alex_fitness_history");
    const timed = row(2, 1, "2024-11-12", "16:30:00");
    const untimed = row(2, 2);
    const older = row(1, 1, "2024-11-10", "07:15:00");

    await db.exec("set role service_role");
    assert.equal(await write([older, untimed, { ...timed, private_note: "not part of the import" }]), true);
    assert.deepEqual((await read()).rows[0].sessions, [timed, untimed, older]);
    assert.equal(await write([older]), false);
    await assert.rejects(write([timed, { ...timed, start_time: null }]), { code: "22023" });
    await assert.rejects(write([row(1, 3, "2024-11-13")]), { code: "22023" });
    await assert.rejects(write([row(1, 3, "2024-11-12", "24:00:00")]), { code: "22023" });
    await assert.rejects(write([]), { code: "22023" });

    await db.exec("reset role; set role anon");
    await assert.rejects(read(), { code: "42501" });
    await db.exec("reset role; set role authenticated; set request.jwt.claim.email = 'client@example.test'");
    assert.deepEqual((await read()).rows, []);
    await db.exec("set request.jwt.claim.email = 'benjaminbenz.fit@gmail.com'");
    assert.equal((await read()).rows[0].sessions.length, 3);
    await assert.rejects(write([older]), { code: "42501" });

    if (process.env.ALEX_FITNESS_IMPORT_FIXTURE) {
      const fixture = JSON.parse(fs.readFileSync(process.env.ALEX_FITNESS_IMPORT_FIXTURE, "utf8"));
      await db.exec("reset role; set role service_role");
      assert.equal(await write(fixture.p_sessions, fixture.p_source_read_at), true);
      const entries = (await read()).rows[0].sessions;
      assert.equal(entries.length, fixture.p_sessions.length);
      assert.equal(entries.filter(({ start_time }) => !start_time).length,
        fixture.p_sessions.filter(({ start_time }) => !start_time).length);
      assert.deepEqual(entries, fixture.p_sessions);
    }
  } finally {
    await db.close();
  }
});
