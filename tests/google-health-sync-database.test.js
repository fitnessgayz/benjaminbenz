const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Optional isolated PostgreSQL runner, with no real credentials or remote data.
// npm install --prefix /tmp/google-health-db-test --ignore-scripts @electric-sql/pglite@0.5.8
// GOOGLE_HEALTH_PGLITE_PATH=/tmp/google-health-db-test/node_modules/@electric-sql/pglite node --test tests/google-health-sync-database.test.js
let PGlite;
try { ({ PGlite } = require(process.env.GOOGLE_HEALTH_PGLITE_PATH || "@electric-sql/pglite")); } catch {}
const migrations = path.join(__dirname, "../supabase/migrations");
const source = fs.readFileSync(path.join(migrations, "20260924141611_google_health_automatic_import.sql"), "utf8");
const original = fs.readFileSync(path.join(migrations, "20260825120000_add_google_health_sync.sql"), "utf8");
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const coach = "33333333-3333-4333-8333-333333333333";
const generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const replacement = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const activity = (sourceName = "device/run-1", values = {}) => ({
  source_name: sourceName, workout_date: "2026-09-24", activity_type: "Run",
  started_at: "2026-09-24T15:00:00Z", ended_at: "2026-09-24T15:40:00Z",
  duration_seconds: 2300, elapsed_seconds: 2400, calories: 0,
  distance_meters: 5000, average_heart_rate: null, ...values
});

test("Google Health migration restricts RPC execution and keeps scheduler credentials in Vault", () => {
  assert.doesNotMatch(source, /security definer/i);
  for (const name of ["claim_google_health_sync", "commit_google_health_sync", "finish_google_health_connection", "disconnect_google_health"]) {
    assert.match(source, new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated;`));
    assert.match(source, new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role;`));
  }
  assert.match(source, /cron\.schedule\('fwb-google-health-sync', '\*\/15 \* \* \* \*'/);
  assert.match(source, /'X-FWB-Health-Sync-Secret'/);
  assert.match(source, /extensions\.gen_random_bytes\(32\)/);
  assert.match(source, /extensions\.digest\(sync_secret, 'sha256'\)/);
  assert.doesNotMatch(source, /insert into public\.client_workout_logs|update public\.client_workout_logs|delete from public\.client_workout_logs/);
});

test("Google Health PostgreSQL policies, leases, reconciliation and OAuth cancellation", {
  skip: !PGlite && "Install optional @electric-sql/pglite or set GOOGLE_HEALTH_PGLITE_PATH"
}, async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema extensions; create schema vault; create schema cron;
      create table auth.users (id uuid primary key, email text);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      create function public.is_coach_admin() returns boolean language sql stable as $$select auth.jwt()->>'email' = 'coach@example.test'$$;
      grant usage on schema auth to authenticated, service_role;
      create table public.client_programs (id uuid default gen_random_uuid(), client_email text, active boolean, client_archived boolean);
      grant select, update on public.client_programs to service_role;
      create table public.client_workout_logs (id integer, exercise_name text);
      insert into public.client_workout_logs values (1, 'Manual session must stay unchanged');
      insert into auth.users values ('${alice}', 'alice@example.test'), ('${bob}', 'bob@example.test'), ('${coach}', 'coach@example.test');
      insert into public.client_programs (client_email, active, client_archived) values ('alice@example.test', true, false), ('bob@example.test', true, false);
      -- Extension APIs are stubbed only for scheduling/secret setup. All table,
      -- grant, RLS and transaction/RPC behavior executes in real PostgreSQL.
      create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab', n), 'hex')$$;
      create function extensions.digest(value text, algorithm text) returns bytea language sql as $$select decode(repeat('cd', 32), 'hex')$$;
      create table vault.decrypted_secrets (id uuid default gen_random_uuid(), name text, decrypted_secret text);
      create function vault.create_secret(value text, secret_name text) returns uuid language sql as $$insert into vault.decrypted_secrets (name, decrypted_secret) values (secret_name, value) returning id$$;
      create table cron.job (jobname text primary key, schedule text, command text);
      create function cron.schedule(job_name text, job_schedule text, job_command text) returns bigint language sql as $$insert into cron.job values (job_name, job_schedule, job_command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint$$;
    `);
    await db.exec(original);
    await db.query("insert into public.client_google_health_connections (client_email,access_token,refresh_token) values ($1,'old-access','old-refresh')", ["alice@example.test"]);
    await db.exec(source.replace(/^create extension if not exists .*;$/gm, ""));
    const asRole = async (role, sql, values = [], identity = null) => {
      await db.exec(`set role ${role}`);
      if (identity) await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(identity)]);
      try { return await db.query(sql, values); } finally { await db.exec("reset role"); }
    };
    const service = (sql, values) => asRole("service_role", sql, values);
    const user = (id, email, sql, values = []) => asRole("authenticated", sql, values, { sub: id, email });
    const claim = async (manual = false, id = generation) => (await service(
      "select public.claim_google_health_sync('alice@example.test', $1, $2) as lease", [id, manual]
    )).rows[0].lease;
    const commit = async (lease, workouts, options = {}) => (await service(
      "select public.commit_google_health_sync($1,$2,$3,$4::jsonb,$5::timestamptz,$6::timestamptz) as result",
      [options.email || "alice@example.test", options.generation || generation, lease, JSON.stringify(workouts), options.start || null, options.end || null]
    )).rows[0].result;
    const resetConnection = async (extra = {}) => {
      await db.query(`update public.client_google_health_connections set connection_id=$1, auto_sync_enabled=$2,
        needs_reconnect=$3, sync_lease_id=null, sync_lease_expires_at=null, sync_lease_manual=false where client_email='alice@example.test'`,
      [extra.generation || generation, extra.enabled ?? true, extra.reconnect ?? false]);
    };

    await t.test("legacy connection gains an owner without turning on automatic sync", async () => {
      const connection = (await db.query("select owner_user_id, auto_sync_enabled from public.client_google_health_connections")).rows[0];
      assert.equal(connection.owner_user_id, alice);
      assert.equal(connection.auto_sync_enabled, false);
      assert.equal((await db.query("select schedule from cron.job")).rows[0].schedule, "*/15 * * * *");
      await assert.rejects(user(alice, "alice@example.test", "select * from public.google_health_sync_config"), /permission denied/);
      await assert.rejects(user(alice, "alice@example.test", "select * from public.client_google_health_connections"), /permission denied/);
    });

    await t.test("manual sync works while paused, and overlapping/stale leases cannot commit", async () => {
      await resetConnection({ enabled: false });
      assert.equal(await claim(), null);
      const lease = await claim(true);
      assert.ok(lease);
      assert.equal(await claim(true), null);
      assert.equal((await commit(replacement, [activity()])).committed, false);
      assert.equal((await commit(lease, [activity()], { generation: replacement })).committed, false);
      const result = await commit(lease, [activity()]);
      assert.deepEqual(result, { committed: true, imported: 1, updated: 0, deleted: 0 });
      assert.equal((await commit(lease, [activity()])).committed, false, "Consumed lease cannot replay");
      const row = (await db.query("select * from public.client_google_health_workouts")).rows[0];
      assert.equal(row.calories, "0");
      assert.equal(row.average_heart_rate, null);
    });

    await t.test("owner and coach may read, while other clients and every browser write are denied", async () => {
      assert.equal((await user(alice, "alice@example.test", "select * from public.client_google_health_workouts")).rows.length, 1);
      assert.equal((await user(bob, "alice@example.test", "select * from public.client_google_health_workouts")).rows.length, 0, "Email spoofing cannot bypass owner ID");
      assert.equal((await user(coach, "coach@example.test", "select * from public.client_google_health_workouts")).rows.length, 1);
      await assert.rejects(asRole("anon", "select * from public.client_google_health_workouts"), /permission denied/);
      for (const sql of ["update public.client_google_health_workouts set calories=100", "delete from public.client_google_health_workouts", "insert into public.client_google_health_workouts (source_name) values ('forged')"])
        await assert.rejects(user(alice, "alice@example.test", sql), /permission denied/);
      for (const sql of [
        `select public.claim_google_health_sync('alice@example.test','${generation}',true)`,
        `select public.commit_google_health_sync('alice@example.test','${generation}','${generation}','[]')`,
        `select public.finish_google_health_connection('alice@example.test','${alice}','state','{}')`,
        `select public.disconnect_google_health('alice@example.test','${alice}')`
      ]) await assert.rejects(user(alice, "alice@example.test", sql), /permission denied/);
    });

    await t.test("idempotent updates derive identity from the connection and invalid batches roll back", async () => {
      await resetConnection();
      const result = await commit(await claim(), [activity("device/run-1", { calories: 200, owner_user_id: bob, client_email: "bob@example.test" }), activity("device/run-2")]);
      assert.deepEqual(result, { committed: true, imported: 1, updated: 1, deleted: 0 });
      assert.deepEqual((await db.query("select distinct owner_user_id,client_email from public.client_google_health_workouts")).rows, [{ owner_user_id: alice, client_email: "alice@example.test" }]);
      const lease = await claim();
      await assert.rejects(commit(lease, [activity("device/run-1", { calories: 999 }), activity("invalid", { average_heart_rate: 999 })]), /check constraint/);
      assert.equal((await db.query("select calories from public.client_google_health_workouts where source_name='device/run-1'")).rows[0].calories, "200");
      await assert.rejects(commit(lease, [activity(), activity()]), /duplicate Google Health source/);
      assert.equal((await commit(lease, [activity("device/run-1", { calories: 200 })])).updated, 1);
    });

    await t.test("expired/replaced leases, paused settings and archived clients reject late results", async () => {
      const oldLease = await claim();
      await db.exec("update public.client_google_health_connections set sync_lease_expires_at=now()-interval '1 second'");
      const newLease = await claim();
      assert.notEqual(newLease, oldLease);
      assert.equal((await commit(oldLease, [])).committed, false);
      await db.exec("update public.client_google_health_connections set auto_sync_enabled=false,sync_lease_id=null,sync_lease_expires_at=null,sync_lease_manual=false");
      assert.equal((await commit(newLease, [])).committed, false);
      await resetConnection();
      const beforeArchive = await claim();
      await db.exec("update public.client_programs set client_archived=true where client_email='alice@example.test'");
      assert.equal((await commit(beforeArchive, [])).committed, false);
      await resetConnection();
      assert.equal(await claim(true), null, "Archived clients cannot start manual sync either");
      await db.exec("update public.client_programs set client_archived=false where client_email='alice@example.test'");
      await resetConnection({ reconnect: true });
      assert.equal(await claim(true), null);
      await resetConnection();
    });

    await t.test("a complete bounded provider window prunes only absent owned imports", async () => {
      await commit(await claim(), [activity("older", { workout_date: "2026-09-01", started_at: "2026-09-01T15:00:00Z", ended_at: "2026-09-01T15:40:00Z" })]);
      await db.query("insert into public.client_google_health_workouts (owner_user_id,client_email,source_name,workout_date,activity_type,started_at) values ($1,'bob@example.test','bob-run','2026-09-24','Run','2026-09-24T16:00:00Z')", [bob]);
      const result = await commit(await claim(), [activity("device/run-1")], { start: "2026-09-24T00:00:00Z", end: "2026-09-25T00:00:00Z" });
      assert.equal(result.deleted, 1);
      assert.deepEqual((await db.query("select source_name from public.client_google_health_workouts order by source_name")).rows.map((row) => row.source_name), ["bob-run", "device/run-1", "older"]);
      assert.equal((await db.query("select exercise_name from public.client_workout_logs")).rows[0].exercise_name, "Manual session must stay unchanged");
    });

    await t.test("OAuth completion checks bound owner/state, rotates generation and invalidates old sync", async () => {
      const lease = await claim();
      await db.query("insert into public.client_google_health_oauth_states (state,client_email,owner_user_id,redirect_uri,expires_at) values ('state-1','alice@example.test',$1,'https://example.test/callback',now()+interval '5 minutes')", [alice]);
      const finish = (owner, state) => service("select public.finish_google_health_connection('alice@example.test',$1,$2,$3::jsonb) as connected", [owner, state, JSON.stringify({ access_token: "fake-access", refresh_token: "fake-refresh", scope: "fake-scope", expires_at: "2026-10-01T00:00:00Z" })]);
      assert.equal((await finish(bob, "state-1")).rows[0].connected, false);
      assert.equal((await finish(alice, "state-1")).rows[0].connected, true);
      assert.equal((await finish(alice, "state-1")).rows[0].connected, false);
      assert.notEqual((await db.query("select connection_id from public.client_google_health_connections")).rows[0].connection_id, generation);
      assert.equal((await commit(lease, [])).committed, false);
      await db.query("insert into public.client_google_health_oauth_states (state,client_email,owner_user_id,expires_at) values ('state-pending','alice@example.test',$1,now()+interval '5 minutes')", [alice]);
      await service("select public.disconnect_google_health('alice@example.test',$1)", [alice]);
      assert.equal((await finish(alice, "state-pending")).rows[0].connected, false, "A callback exchanging tokens cannot resurrect a disconnected connection");
      assert.equal((await db.query("select * from public.client_google_health_connections")).rows.length, 0);
      assert.equal((await user(alice, "alice@example.test", "select * from public.client_google_health_workouts")).rows.length, 2, "Disconnect preserves imported history");
    });
  } finally { await db.close(); }
});
