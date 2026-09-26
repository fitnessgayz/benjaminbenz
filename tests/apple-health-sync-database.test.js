const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
let PGlite;
try { ({ PGlite } = require(process.env.APPLE_HEALTH_PGLITE_PATH || '@electric-sql/pglite')); } catch {}
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260926002651_add_opt_in_apple_health_imports.sql'), 'utf8');
const alice = '11111111-1111-4111-8111-111111111111', bob = '22222222-2222-4222-8222-222222222222', coach = '33333333-3333-4333-8333-333333333333';
test('Apple Health sharing uses guarded RPCs, RLS and isolated import tables', () => {
  assert.equal((sql.match(/enable row level security/g) || []).length, 3);
  assert.equal((sql.match(/security definer set search_path = ''/g) || []).length, 2);
  assert.equal((sql.match(/p_expected_user_id is distinct from v_uid/g) || []).length, 2);
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\.(?:client_progress|client_workout_logs|client_apple_workouts)\b/);
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete).*to authenticated/);
});
test('Apple Health consent, snapshot reconciliation and account isolation in PostgreSQL', {skip: !PGlite && 'Set APPLE_HEALTH_PGLITE_PATH to isolated PGlite installation'}, async t => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
      create function public.is_coach_admin() returns boolean language sql stable as $$select auth.jwt()->>'email'='coach@example.test'$$;
      grant usage on schema auth to authenticated;
      insert into auth.users values('${alice}','alice@example.test'),('${bob}','bob@example.test'),('${coach}','coach@example.test');
      create table public.client_workout_logs(id integer, note text); insert into public.client_workout_logs values(1,'manual');`);
    await db.exec(sql);
    const user = async (id,email,query,params=[]) => {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id,email})]);
      try { return await db.query(query,params); } finally { await db.exec('reset role'); }
    };
    const asAlice = (query,p) => user(alice,'alice@example.test',query,p);
    const share = cats => asAlice('select public.set_apple_health_sharing($1,$2)',[alice,cats]);
    const now = new Date(), since = new Date(now.getTime()-86400000*2).toISOString(), day = now.toISOString().slice(0,10);
    const workout = {healthkit_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', activity_type:'Run',started_at:new Date(now.getTime()-3600000).toISOString(),ended_at:now.toISOString(),duration_seconds:3600,active_calories:0,distance_meters:5000,average_heart_rate:null,source_name:'Fixture'};
    const upload = (cats,workouts=[],daily=[],id=alice) => asAlice('select public.replace_apple_health_snapshot($1,$2,$3,$4,$5::jsonb,$6::jsonb)',[id,since,since.slice(0,10),cats,JSON.stringify(workouts),JSON.stringify(daily)]);
    await t.test('new accounts are opted out and cannot upload before consent',async()=>{
      await assert.rejects(upload(['activity'],[],[{date:day,steps:1000}]),/consent required/);
      await assert.rejects(asAlice('select public.set_apple_health_sharing($1,$2)',[bob,['activity']]),/Account changed/);
      await assert.rejects(share(['unknown']),/Invalid categories/);
      assert.equal((await db.query('select * from public.client_apple_health_settings')).rows.length,0);
    });
    await t.test('selected imports preserve zero and missing values',async()=>{
      await share(['workouts','activity','recovery','bodyWeight']);
      await upload(['workouts','activity','recovery','bodyWeight'],[workout],[{date:day,steps:0,sleep_minutes:420,body_weight_kg:80,body_weight_sample_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}]);
      const row=(await asAlice('select * from public.client_apple_health_daily')).rows[0];
      assert.equal(row.steps,0); assert.equal(row.hrv_ms,null); assert.equal(row.body_weight_kg,80);
      assert.equal((await asAlice('select * from public.client_apple_health_workouts')).rows[0].active_calories,0);
    });
    await t.test('other accounts cannot read and coach cannot write',async()=>{
      assert.equal((await user(bob,'bob@example.test','select * from public.client_apple_health_daily')).rows.length,0);
      assert.equal((await user(bob,'alice@example.test','select * from public.client_apple_health_daily')).rows.length,0);
      assert.equal((await user(coach,'coach@example.test','select * from public.client_apple_health_daily')).rows.length,1);
      for(const query of ['delete from public.client_apple_health_daily','update public.client_apple_health_settings set shared_categories=\'{}\'','insert into public.client_apple_health_workouts(user_id) values(null)']) {
        await assert.rejects(asAlice(query),/permission denied/);
        await assert.rejects(user(coach,'coach@example.test',query),/permission denied/);
      }
      await db.exec('set role anon');
      try { await assert.rejects(db.query('select * from public.client_apple_health_daily'),/permission denied/); } finally { await db.exec('reset role'); }
    });
    await t.test('partial snapshot updates only queried categories and reconciles deletions',async()=>{
      await upload(['activity'],[],[{date:day,steps:1234,body_weight_kg:99}]);
      let row=(await asAlice('select * from public.client_apple_health_daily')).rows[0];
      assert.equal(row.steps,1234); assert.equal(row.body_weight_kg,80);
      await upload(['activity']);
      row=(await asAlice('select * from public.client_apple_health_daily')).rows[0];
      assert.equal(row.steps,null); assert.equal(row.body_weight_kg,80);
      await upload(['workouts']);
      assert.equal((await asAlice('select * from public.client_apple_health_workouts')).rows.length,0);
    });
    await t.test('invalid snapshots roll back and never create nonfinite records',async()=>{
      for(const steps of [-1,200001,'NaN','Infinity']) await assert.rejects(upload(['activity'],[],[{date:day,steps}]));
      await assert.rejects(upload(['activity'],[],[{date:day,steps:1},{date:day,steps:2}]),/Duplicate/);
      await assert.rejects(upload(['workouts'],Array(1001).fill(workout)),/size/);
      await assert.rejects(upload(['workouts'],[{...workout,ended_at:'2000-01-01'}]));
      await assert.rejects(upload(['activity'],[],[{date:'2000-01-01',steps:1}]),/date/);
      assert.equal((await asAlice('select body_weight_kg from public.client_apple_health_daily')).rows[0].body_weight_kg,80);
    });
    await t.test('revocation removes only revoked data and blocks stale uploads',async()=>{
      await share(['bodyWeight']);
      const row=(await asAlice('select * from public.client_apple_health_daily')).rows[0];
      assert.equal(row.sleep_minutes,null); assert.equal(row.body_weight_kg,80);
      await assert.rejects(upload(['recovery'],[],[{date:day,sleep_minutes:400}]),/consent required/);
      await share([]);
      assert.equal((await user(coach,'coach@example.test','select * from public.client_apple_health_settings')).rows.length,0);
      assert.equal((await db.query('select * from public.client_apple_health_daily')).rows.length,0);
      assert.equal((await db.query('select note from public.client_workout_logs')).rows[0].note,'manual');
    });
  } finally { await db.close(); }
});
