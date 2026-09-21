const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Optional isolated Postgres runner; no network or production data is used.
// npm install --prefix /tmp/apple-workout-db-test --ignore-scripts @electric-sql/pglite@0.5.8
// APPLE_WORKOUT_PGLITE_PATH=/tmp/apple-workout-db-test/node_modules/@electric-sql/pglite node --test tests/apple-workout-database.test.js
let PGlite;
try { ({ PGlite } = require(process.env.APPLE_WORKOUT_PGLITE_PATH || "@electric-sql/pglite")); } catch {}
const migrationDir = path.join(__dirname, "../supabase/migrations");
const migrationPath = path.join(migrationDir, fs.readdirSync(migrationDir).find((name) => name.endsWith("_add_apple_workout_attachments.sql")));
const migration = fs.readFileSync(migrationPath, "utf8");
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const coach = "33333333-3333-4333-8333-333333333333";
const session = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const secondary = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

test("migration declares private bounded storage, reviewed metadata, and a service-only quota", () => {
  assert.match(migration, /'apple-workouts', 'apple-workouts', false, 8388608/);
  assert.match(migration, /unique \(client_email, history_key\)/);
  assert.match(migration, /alter table public\.client_apple_workouts enable row level security/);
  assert.match(migration, /revoke all on function public\.consume_apple_workout_extraction\(uuid\) from public, anon, authenticated/);
  assert.doesNotMatch(migration, /security definer/i);
});

test("real Postgres policies isolate clients, allow coach reads, bind logs and objects, and cap extraction calls", { skip: !PGlite && "Install optional @electric-sql/pglite to run the isolated database policy test" }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      create function public.is_coach_admin() returns boolean language sql stable as $$select auth.jwt()->>'email' = 'coach@example.com'$$;
      create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at = now(); return new; end;$$;
      create table public.client_workout_logs (id uuid default gen_random_uuid(), client_email text, entry_date date, workout_title text, session_id uuid, workout_session_id uuid);
      alter table public.client_workout_logs enable row level security;
      grant select on public.client_workout_logs to authenticated;
      create policy own_logs on public.client_workout_logs for select to authenticated using (lower(btrim(client_email)) = lower(btrim(auth.jwt()->>'email')) or public.is_coach_admin());
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text);
      create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1]$$;
      alter table storage.objects enable row level security;
      grant usage on schema auth, storage to authenticated, service_role;
      grant select, insert, update, delete on storage.objects to authenticated;
      insert into auth.users values ('${alice}'), ('${bob}'), ('${coach}');
      insert into public.client_workout_logs (client_email, entry_date, workout_title, session_id, workout_session_id) values
        ('alice@example.com', '2026-09-21', 'Strength', '${session}', '${secondary}'),
        ('alice@example.com', '2026-09-20', '  Older workout  ', null, null),
        ('bob@example.com', '2026-09-21', 'Strength', '${secondary}', null);
    `);
    await db.exec(migration);
    const asUser = async (id, email, sql, params = []) => {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: id, email })]);
      try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
    };
    const insert = `insert into public.client_apple_workouts
      (owner_user_id, client_email, history_key, storage_path, original_filename, mime_type, file_size_bytes, workout_date, duration_seconds, active_calories, total_calories, average_heart_rate)
      values ($1, $2, $3, $4, 'workout.png', 'image/png', 1024, '2026-09-21', 4992, 338, 465, 106) returning id`;
    await asUser(alice, "alice@example.com", "insert into storage.objects (bucket_id,name,owner_id) values ('apple-workouts',$1,$2)", [`${alice}/first.png`, alice]);
    const saved = await asUser(alice, "alice@example.com", insert, [alice, "alice@example.com", `session:${session}`, `${alice}/first.png`]);
    const attachmentId = saved.rows[0].id;
    assert.equal((await asUser(alice, "alice@example.com", "select * from public.client_apple_workouts")).rows.length, 1);
    assert.equal((await asUser(bob, "bob@example.com", "select * from public.client_apple_workouts")).rows.length, 0);
    assert.equal((await asUser(bob, "bob@example.com", "select * from storage.objects")).rows.length, 0);
    assert.equal((await asUser(coach, "coach@example.com", "select * from public.client_apple_workouts")).rows.length, 1);
    assert.equal((await asUser(coach, "coach@example.com", "select * from storage.objects")).rows.length, 1);
    assert.equal((await asUser(coach, "coach@example.com", "update public.client_apple_workouts set active_calories=999 returning id")).rows.length, 0);
    assert.equal((await asUser(coach, "coach@example.com", "delete from public.client_apple_workouts returning id")).rows.length, 0);
    await assert.rejects(asUser(bob, "bob@example.com", insert, [bob, "bob@example.com", `session:${session}`, `${alice}/first.png`]), /row-level security|check constraint/);
    await asUser(alice, "alice@example.com", "insert into storage.objects (bucket_id,name,owner_id) values ('apple-workouts',$1,$2)", [`${alice}/replacement.png`, alice]);
    await assert.rejects(asUser(alice, "alice@example.com", insert, [alice, "alice@example.com", `session:${secondary}`, `${alice}/replacement.png`]), /row-level security/);
    await assert.rejects(asUser(alice, "alice@example.com", insert, [alice, "alice@example.com", "legacy:2026-09-21::strength", `${alice}/replacement.png`]), /row-level security/);
    await assert.rejects(asUser(alice, "alice@example.com", "update public.client_apple_workouts set owner_user_id=$1 where id=$2", [bob, attachmentId]), /row-level security|check constraint/);
    await assert.rejects(asUser(alice, "alice@example.com", "update public.client_apple_workouts set storage_path=$1 where id=$2", [`${alice}/missing.png`, attachmentId]), /row-level security/);
    await assert.rejects(asUser(alice, "alice@example.com", "update public.client_apple_workouts set average_heart_rate=301 where id=$1", [attachmentId]), /check constraint/);
    assert.equal((await asUser(alice, "alice@example.com", "delete from storage.objects where name=$1 returning id", [`${alice}/first.png`])).rows.length, 0, "Referenced screenshot cannot be deleted prematurely");
    await asUser(alice, "alice@example.com", "update public.client_apple_workouts set storage_path=$1, active_calories=null where id=$2", [`${alice}/replacement.png`, attachmentId]);
    assert.equal((await asUser(alice, "alice@example.com", "delete from storage.objects where name=$1 returning id", [`${alice}/first.png`])).rows.length, 1);
    await asUser(alice, "alice@example.com", "delete from public.client_apple_workouts where id=$1", [attachmentId]);
    await asUser(alice, "alice@example.com", insert, [alice, "alice@example.com", "legacy:2026-09-20::older workout", `${alice}/replacement.png`]);
    await assert.rejects(asUser(alice, "alice@example.com", "select public.consume_apple_workout_extraction($1)", [alice]), /permission denied/);
    await db.exec("set role service_role");
    for (let attempt = 1; attempt <= 21; attempt++) {
      const result = await db.query("select public.consume_apple_workout_extraction($1) as accepted", [alice]);
      assert.equal(result.rows[0].accepted, attempt <= 20);
    }
    await db.exec("reset role");
    await db.query("update private.apple_workout_extraction_limits set quota_date=quota_date-1 where owner_user_id=$1", [alice]);
    await db.exec("set role service_role");
    assert.equal((await db.query("select public.consume_apple_workout_extraction($1) as accepted", [alice])).rows[0].accepted, true);
    await db.exec("reset role");
  } finally { await db.close(); }
});
