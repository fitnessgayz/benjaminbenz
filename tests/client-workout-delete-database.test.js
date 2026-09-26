const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Isolated Postgres. No production credentials or client records are used.
let PGlite;
try { ({ PGlite } = require(process.env.WORKOUT_DELETE_PGLITE_PATH || "@electric-sql/pglite")); } catch {}
const migration = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20260926003151_delete_client_workout_sessions.sql"), "utf8");
const alice = "11111111-1111-4111-8111-111111111111";
const bob = "22222222-2222-4222-8222-222222222222";
const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const rowA = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const rowB = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const rowOther = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";

test("deletion migration keeps privileged implementation private and preserves health files", () => {
  assert.match(migration, /public\.delete_client_workout_session[\s\S]+security invoker/);
  assert.match(migration, /revoke all on fwb_workout_private\.deleted_sessions from public, anon, authenticated/);
  assert.doesNotMatch(migration, /delete from (?:storage\.|public\.client_apple|public\.client_google|public\.client_program)/);
});

test("real Postgres workout deletion is atomic, owner-scoped, retry-safe, and rejects stale writes", { skip: !PGlite && "Install @electric-sql/pglite or set WORKOUT_DELETE_PGLITE_PATH" }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      grant usage on schema auth to authenticated, anon;
      create table public.client_workout_logs (id uuid primary key default gen_random_uuid(), client_email text not null, entry_date date not null, workout_title text not null, session_id uuid not null, notes text);
      create table public.client_workout_drafts (session_id uuid primary key, client_email text not null, entry_date date not null, workout_title text not null);
      create table public.workout_session_feedback (session_id uuid primary key, client_email text not null, entry_date date not null, workout_title text not null);
      grant select,insert,update on public.client_workout_logs, public.client_workout_drafts, public.workout_session_feedback to authenticated;
      alter table public.client_workout_logs enable row level security;
      create policy own_logs on public.client_workout_logs for all to authenticated using (lower(btrim(client_email))=lower(btrim(auth.jwt()->>'email')));
      create function public.fwb_fill_workout_log_sync_ids() returns trigger language plpgsql as $$begin if new.session_id is null then new.session_id := md5(lower(trim(new.client_email)) || '|' || new.entry_date::text || '|' || lower(trim(new.workout_title)))::uuid; end if; return new; end;$$;
      create trigger fwb_fill_client_workout_log_sync_ids before insert or update on public.client_workout_logs for each row execute function public.fwb_fill_workout_log_sync_ids();
      insert into auth.users values ('${alice}'), ('${bob}');
      insert into public.client_workout_logs (id,client_email,entry_date,workout_title,session_id) values
        ('${rowA}','alice@example.com','2026-09-25','Strength','${first}'),
        ('${rowB}',' ALICE@example.com ','2026-09-25','Strength','${first}'),
        ('${rowOther}','alice@example.com','2026-09-25','Strength','${second}'),
        (gen_random_uuid(),'bob@example.com','2026-09-25','Strength','${first}');
      insert into public.client_workout_drafts values ('${first}','alice@example.com','2026-09-25','Strength');
      insert into public.workout_session_feedback values ('${first}','alice@example.com','2026-09-25','Strength');
    `);
    await db.exec(migration);
    const asUser = async (id, email, sql, params = [], role = "authenticated") => {
      await db.exec(`set role ${role}`);
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, email })]);
      try { return await db.query(sql, params); } finally { await db.exec("reset role"); }
    };
    const rpc = "select public.delete_client_workout_session($1,$2) as result";
    await assert.rejects(asUser(alice, "alice@example.com", rpc, [first, [rowA]]), /Choose one workout/);
    await assert.rejects(asUser(alice, "alice@example.com", rpc, [null, []]), /Choose one workout/);
    await assert.rejects(asUser(alice, "alice@example.com", rpc, [null, [rowA, rowOther]]), /Refresh your workout/);
    await assert.rejects(asUser(bob, "bob@example.com", rpc, [second, null]), /could not be found/);
    await assert.rejects(asUser(bob, "bob@example.com", rpc, [null, [rowA]]), /Refresh your workout/);
    await assert.rejects(asUser(null, null, rpc, [first, null]), /Sign in/);
    await assert.rejects(asUser(alice, "alice@example.com", rpc, [first, null], "anon"), /permission denied/);
    await assert.rejects(asUser(alice, "alice@example.com", "select * from fwb_workout_private.deleted_sessions"), /permission denied/);
    await assert.rejects(asUser(alice, "alice@example.com", "insert into fwb_workout_private.deleted_sessions values ('alice@example.com',$1,$1,$2,now())", [first, alice]), /permission denied/);

    // A later-table failure rolls back removed sets and their tombstone together.
    await db.exec("create function public.test_delete_failure() returns trigger language plpgsql as $$begin raise exception 'fixture failure'; end;$$; create trigger test_delete_failure before delete on public.workout_session_feedback for each row execute function public.test_delete_failure();");
    await assert.rejects(asUser(alice, "alice@example.com", rpc, [first, null]), /fixture failure/);
    assert.equal((await db.query("select count(*)::int as n from public.client_workout_logs")).rows[0].n, 4);
    assert.equal((await db.query("select count(*)::int as n from fwb_workout_private.deleted_sessions")).rows[0].n, 0);
    await db.exec("drop trigger test_delete_failure on public.workout_session_feedback");

    const deleted = await asUser(alice, " ALICE@example.com ", rpc, [null, [rowA, rowB, rowA]]);
    assert.deepEqual(deleted.rows[0].result, { deleted_count: 2, session_id: first });
    assert.deepEqual((await asUser(alice, "alice@example.com", rpc, [first, null])).rows[0].result, { deleted_count: 0, session_id: first });
    assert.equal((await db.query("select count(*)::int as n from public.client_workout_logs")).rows[0].n, 2, "same-date different session and other client remain");
    assert.equal((await db.query("select count(*)::int as n from public.client_workout_drafts")).rows[0].n, 0);
    assert.equal((await db.query("select count(*)::int as n from public.workout_session_feedback")).rows[0].n, 0);

    for (const table of ["client_workout_logs", "client_workout_drafts", "workout_session_feedback"]) {
      await assert.rejects(asUser(alice, "alice@example.com", `insert into public.${table} (session_id,client_email,entry_date,workout_title) values ($1,'alice@example.com','2026-09-25','Strength')`, [first]), (error) => error.message === "workout_session_deleted" && error.code === "P0001");
    }
    await assert.rejects(asUser(alice, "alice@example.com", "insert into public.client_workout_logs (client_email,entry_date,workout_title) values ('alice@example.com','2026-09-25','Strength')"), /workout_session_deleted/, "old web payloads without IDs cannot resurrect a deleted session");
    await assert.rejects(asUser(alice, "alice@example.com", "update public.client_workout_logs set session_id=$1 where id=$2", [first, rowOther]), /workout_session_deleted/);
    await asUser(alice, "alice@example.com", "insert into public.client_workout_logs (client_email,entry_date,workout_title,session_id) values ('alice@example.com','2026-09-25','Strength',gen_random_uuid())");
    assert.equal((await db.query("select count(*)::int as n from public.client_workout_logs")).rows[0].n, 3, "a deliberately new session can be logged on the same day");
    // An older deterministic session may coexist with a newer native session
    // using the same title/date. Deleting one must not tombstone the other.
    const coexist = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const legacy = (await db.query("select md5('alice@example.com|2026-09-24|strength')::uuid as id")).rows[0].id;
    await asUser(alice, "alice@example.com", "insert into public.client_workout_logs (client_email,entry_date,workout_title,session_id) values ('alice@example.com','2026-09-24','Strength',$1),('alice@example.com','2026-09-24','Strength',$2)", [coexist, legacy]);
    await asUser(alice, "alice@example.com", rpc, [coexist, null]);
    assert.equal((await asUser(alice, "alice@example.com", "update public.client_workout_logs set notes='Still editable' where session_id=$1 returning id", [legacy])).rows.length, 1);
    await asUser(alice, "alice@example.com", rpc, [legacy, null]);
    await assert.rejects(asUser(alice, "alice@example.com", "insert into public.client_workout_logs (client_email,entry_date,workout_title) values ('alice@example.com','2026-09-24','Strength')"), /workout_session_deleted/);
  } finally { await db.close(); }
});
