const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let PGlite;
try { ({ PGlite } = require(process.env.PROGRESSION_PGLITE_PATH || '@electric-sql/pglite')); } catch {}
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260926152453_add_workout_progression_targets.sql'), 'utf8');
const target = { enabled: true, exercise_key: 'name:dumbbell press', rep_min: 8, rep_max: 12,
  planned_sets: 3, target_rir: 2, increment: 2.5, unit: 'lb', required_sessions: 2 };

test('progression migration keeps existing access policy and legacy records unchanged', () => {
  assert.doesNotMatch(migration, /security definer|disable row level security|grant\s+.*\s+to\s+anon|update public\.client_workout_logs\s+set/i);
  assert.match(migration, /add column if not exists progression_target jsonb/);
  assert.match(migration, /new\.progression_target := old\.progression_target/);
});

test('Postgres validates target snapshots, preserves original plans and enforces existing owner access', {
  skip: !PGlite && 'Install @electric-sql/pglite or set PROGRESSION_PGLITE_PATH'
}, async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public.client_workout_logs (id integer primary key, client_email text not null, reps integer);
      insert into public.client_workout_logs values (1,'alice@example.com',8);
      alter table public.client_workout_logs enable row level security;
      grant select,insert,update,delete on public.client_workout_logs to authenticated;
      create policy owner on public.client_workout_logs to authenticated
        using (client_email = current_setting('test.email',true))
        with check (client_email = current_setting('test.email',true));`);
    await db.exec(migration);
    assert.equal((await db.query('select progression_target from public.client_workout_logs where id=1')).rows[0].progression_target, null);
    const runAs = async (email, sql, args = []) => {
      await db.exec('begin; set local role authenticated');
      try {
        await db.query("select set_config('test.email',$1,true)", [email]);
        const value = await db.query(sql, args);
        await db.exec('commit');
        return value;
      } catch (error) { await db.exec('rollback'); throw error; }
    };
    const insert = 'insert into public.client_workout_logs (id,client_email,reps,progression_target) values ($1,$2,12,$3)';
    await runAs('alice@example.com', insert, [2, 'alice@example.com', target]);
    for (const invalid of [[], {}, { ...target, planned_sets: 0 }, { ...target, rep_min: 13 },
      { ...target, target_rir: '2' }, { ...target, increment: 0 }, { ...target, required_sessions: 1 },
      { ...target, unit: 'unknown' }, { ...target, enabled: null }, { ...target, rep_max: 12.5 }]) {
      await assert.rejects(runAs('alice@example.com', insert, [3, 'alice@example.com', invalid]), /progression_target_valid/);
    }
    await runAs('alice@example.com', insert, [3, 'alice@example.com', { ...target, enabled: false, unit: 'kg' }]);
    await runAs('alice@example.com', 'update public.client_workout_logs set progression_target=$1,reps=10 where id=2', [{ ...target, planned_sets: 1 }]);
    let saved = (await runAs('alice@example.com', 'select * from public.client_workout_logs where id=2')).rows[0];
    assert.deepEqual(saved.progression_target, target, 'Removing a prescribed set cannot lower the saved goal');
    assert.equal(saved.reps, 10, 'Actual results remain editable');
    await runAs('alice@example.com', 'update public.client_workout_logs set progression_target=null where id=2');
    assert.deepEqual((await runAs('alice@example.com', 'select progression_target from public.client_workout_logs where id=2')).rows[0].progression_target, target);
    assert.equal((await runAs('bob@example.com', 'select * from public.client_workout_logs')).rows.length, 0);
    assert.equal((await runAs('bob@example.com', 'update public.client_workout_logs set reps=99 where id=2 returning id')).rows.length, 0);
    await assert.rejects(runAs('bob@example.com', insert, [4, 'alice@example.com', target]), /row-level security/);
    await assert.rejects(runAs('alice@example.com', "update public.client_workout_logs set client_email='bob@example.com' where id=2"), /row-level security/);
    await runAs('alice@example.com', 'delete from public.client_workout_logs where id=2');
    assert.equal((await runAs('alice@example.com', 'select * from public.client_workout_logs where id=2')).rows.length, 0);
  } finally { await db.close(); }
});
