const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let PGlite;
try {
  ({ PGlite } = require(process.env.ACTIVITY_LIKES_PGLITE_PATH || "@electric-sql/pglite"));
} catch {}

const migration = fs.readFileSync(path.join(__dirname,
  "../supabase/migrations/20261124185356_coach_fwb_monthly_session_totals.sql"), "utf8");
const coachHelper = fs.readFileSync(path.join(__dirname,
  "../supabase/migrations/20260812182704_benjamin_ai_coach.sql"), "utf8")
  .match(/create or replace function public\.is_coach_admin\(\)[\s\S]*?\$\$;/)[0];

test("scheduled replacement totals count cancellations separately and keep coach-only access", {
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

    const store = async (cutoff, completed, cancelled, month = "2024-11-01") =>
      (await db.query("select public.save_coach_fwb_monthly_session_total($1, $2, $3, $4) as changed",
        [month, cutoff, completed, cancelled])).rows[0].changed;
    const read = async () => (await db.query("select completed_count, cancelled_count from public.coach_fwb_monthly_session_totals")).rows;

    await db.exec("set role service_role");
    assert.equal(await store("2024-11-14T18:00:00-08:00", 8, 1), true);
    assert.equal(await store("2024-11-14T18:00:00-08:00", 8, 1), false);
    assert.equal(await store("2024-11-14T19:00:00-08:00", 8, 2), true);
    assert.equal(await store("2024-11-14T18:00:00-08:00", 99, 99), false);
    assert.equal(await store("2024-12-01T00:00:00-08:00", 10, 3), true);
    assert.equal(await store("2024-12-01T00:00:00-08:00", 10, 2), true);
    assert.deepEqual(await read(), [{ completed_count: 10, cancelled_count: 2 }]);
    await assert.rejects(store("2024-11-15T18:00:00-08:00", 8, -1), { code: "23514" });
    await assert.rejects(store("2024-12-01T00:00:01-08:00", 8, 1), { code: "23514" });
    await assert.rejects(store("2024-11-30T18:00:00-08:00", 8, 1, "2024-11-02"), { code: "23514" });
    await assert.rejects(store("infinity", 8, 1), { code: "22023" });

    await db.exec("reset role; set role anon");
    await assert.rejects(read(), { code: "42501" });
    await db.exec("reset role; set role authenticated; set request.jwt.claim.email = 'client@example.test'");
    assert.deepEqual(await read(), []);
    await db.exec("set request.jwt.claim.email = 'benjaminbenz.fit@gmail.com'");
    assert.deepEqual(await read(), [{ completed_count: 10, cancelled_count: 2 }]);
    await assert.rejects(store("2024-11-15T18:00:00-08:00", 99, 99), { code: "42501" });
    await assert.rejects(db.exec("update public.coach_fwb_monthly_session_totals set cancelled_count = 99"), { code: "42501" });
  } finally {
    await db.close();
  }
});
