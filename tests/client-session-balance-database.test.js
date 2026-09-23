const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Optional isolated Postgres runner. It never connects to the live database.
// SESSION_BALANCE_PGLITE_PATH=/tmp/apple-workout-db-test/node_modules/@electric-sql/pglite node --test tests/client-session-balance-database.test.js
let PGlite;
try { ({ PGlite } = require(process.env.SESSION_BALANCE_PGLITE_PATH || "@electric-sql/pglite")); } catch {}
const root = path.join(__dirname, "..");
const migrations = path.join(root, "supabase/migrations");
const migration = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find(name => name.endsWith("_client_session_balance_notifications.sql"))), "utf8");
const thresholdMigration = fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find(name => name.endsWith("_client_session_balance_threshold_two.sql"))), "utf8");
const currentMigrations = migration + "\n" + thresholdMigration;
const integration = fs.readFileSync(path.join(root, "supabase/tests/client_session_balance_notifications.sql"), "utf8");
const modernSource = fs.readFileSync(path.join(migrations, "20260917124828_add_web_push_notifications.sql"), "utf8");
function modernFunction(name) {
  const start = modernSource.indexOf(`create or replace function private.${name}(`);
  assert.ok(start >= 0);
  return modernSource.slice(start, modernSource.indexOf("\n$$;", start) + 4);
}

test("upgraded inbox honors current preferences when legacy settings remain", {
  skip: !PGlite && "Install optional @electric-sql/pglite to run isolated database tests"
}, async () => {
  const db = await database("modern");
  try {
    const client = "11111111-1111-4111-8111-111111111111";
    await db.exec(`
      create table public.fwb_notification_settings(user_id uuid primary key,categories jsonb default '{}');
      insert into auth.users(id,email) values ('${client}','test@example.invalid');
      insert into public.fwb_notification_settings(user_id,categories) values ('${client}','{"low_sessions":false}');
      insert into public.client_notification_preferences(user_id,session_balance) values ('${client}',true);
      insert into public.client_programs(client_email,client_name,program_title,session_count_used,session_count_total)
        values ('test@example.invalid','Test','Plan',6,10);
      update public.client_programs set session_count_used=8;
    `);
    assert.equal((await db.query("select count(*)::int as count from public.client_notifications where dedupe_key like 'client-session-balance:v2:%'")).rows[0].count, 1);
    await db.exec(`
      update public.fwb_notification_settings set categories='{}';
      update public.client_notification_preferences set session_balance=false;
      update public.client_programs set session_count_used=10;
    `);
    assert.equal((await db.query("select count(*)::int as count from public.client_notifications where dedupe_key like 'client-session-balance:v2:%'")).rows[0].count, 1);
  } finally { await db.close(); }
});

const legacyProducer = `
create or replace function fwb_private.emit(p_email text,p_category text,p_title text,p_body text,p_key text,p_coach boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 select id into recipient from auth.users where lower(email)=lower(p_email) and deleted_at is null limit 1;
 if recipient is null then return; end if;
 if not exists(select 1 from public.fwb_notification_settings s where s.user_id=recipient and coalesce((s.categories->>p_category)::boolean,true)) then return; end if;
 insert into public.client_notifications(user_id,kind,title,body,web_category,web_url,web_dedupe_key)
 values(recipient,case when p_category in ('coach_reply','program_update','workout_reminder','weekly_check_in') then p_category else 'general' end,p_title,p_body,p_category,
 case when p_coach then '/coach-admin.html?notifications=1' else '/client-dashboard.html?notifications=1' end,p_key)
 on conflict(user_id,web_dedupe_key) where web_dedupe_key is not null do nothing;
end $$;
create or replace function fwb_private.notify_program() returns trigger language plpgsql security definer set search_path='' as $$
declare old_remaining integer; remaining integer; event_key text;
begin
 if not new.active or new.client_archived then return new; end if;
 event_key := new.id::text||':'||new.updated_at::text;
 if tg_op='INSERT' then
  perform fwb_private.emit(new.client_email,'program_update','Your program is ready','Your coach has added your training program.','program:'||event_key);
 elsif new.workouts is distinct from old.workouts or new.program_title is distinct from old.program_title or (new.active and not old.active) then
  perform fwb_private.emit(new.client_email,'program_update','Your program was updated','Open FWB to review your latest training plan.','program:'||event_key);
 end if;
 if tg_op='UPDATE' and new.coach_note_body is distinct from old.coach_note_body and coalesce(new.coach_note_body,'')<>'' then
  perform fwb_private.emit(new.client_email,'coach_reply','A note from your coach','Open your dashboard to read your coach’s latest note.','note:'||event_key);
 end if;
 remaining:=new.session_count_total-new.session_count_used;
 old_remaining:=case when tg_op='INSERT' then 999999 else old.session_count_total-old.session_count_used end;
 if new.session_count_total>0 and remaining<=2 and (old_remaining>2 or (tg_op='UPDATE' and old.session_count_total=0)) then
  perform fwb_private.emit(new.client_email,'low_sessions','Your package is running low',greatest(remaining,0)::text||' sessions left. Contact your coach to renew.','balance:'||event_key);
  perform fwb_private.emit('benjaminbenz.fit@gmail.com','low_sessions','A client is due to renew',new.client_name||' has '||greatest(remaining,0)::text||' sessions left.','coach-balance:'||event_key,true);
 end if;
 return new;
end $$;
create trigger fwb_program_notifications after insert or update on public.client_programs for each row execute function fwb_private.notify_program();
`;

async function database(backend, beforeMigration = "", beforeThresholdMigration = "") {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema fwb_private; create schema private;
    create table auth.users(id uuid primary key,email text,deleted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
    create table public.client_programs(
      id uuid primary key default gen_random_uuid(),client_email text,client_name text,program_title text,program_summary text,
      workouts jsonb default '[]',active boolean default true,client_archived boolean default false,
      session_count_used integer default 0,session_count_total integer default 0,session_package_history jsonb default '[]',
      coach_note_title text,coach_note_body text,nutrition_plan jsonb,created_at timestamptz default now(),updated_at timestamptz default now()
    );
    create table public.client_notifications(
      id uuid primary key default gen_random_uuid(),user_id uuid references auth.users,kind text default 'general',title text,body text,
      created_at timestamptz default now(),read_at timestamptz
    );
    create table public.client_notification_preferences(user_id uuid primary key references auth.users);
  `);
  if (backend === "legacy") {
    await db.exec(`
      alter table public.client_notifications add column web_category text,add column web_url text,add column web_dedupe_key text;
      create unique index legacy_notification_dedupe on public.client_notifications(user_id,web_dedupe_key) where web_dedupe_key is not null;
      create table public.fwb_notification_settings(user_id uuid primary key references auth.users,categories jsonb default '{}',push_enabled boolean default false);
      ${legacyProducer}
    `);
  } else {
    await db.exec(`
      alter table public.client_notifications add column recipient_role text default 'client',add column action_url text,
        add column dedupe_key text,add column metadata jsonb default '{}',add column expires_at timestamptz;
      create unique index modern_notification_dedupe on public.client_notifications(user_id,dedupe_key) where dedupe_key is not null;
      alter table public.client_notification_preferences add column session_balance boolean default true;
      ${modernFunction("fwb_notification_user_id")}
      ${modernFunction("fwb_queue_notification")}
      ${modernFunction("fwb_program_notification_trigger")}
      create trigger fwb_program_notifications after insert or update on public.client_programs for each row execute function private.fwb_program_notification_trigger();
    `);
  }
  if (beforeMigration) await db.exec(beforeMigration);
  await db.exec(migration);
  if (beforeThresholdMigration) await db.exec(beforeThresholdMigration);
  await db.exec(thresholdMigration);
  return db;
}

for (const backend of ["legacy", "modern"]) {
  test(`${backend}: two-session migration rearms silent seeds but preserves sent notices and out flags`, {
    skip: !PGlite && "Install optional @electric-sql/pglite to run isolated database tests"
  }, async () => {
    const db = await database(backend, `
      insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','seed@example.invalid');
      insert into public.client_programs(client_email,client_name,program_title,session_count_used,session_count_total)
        values ('seed@example.invalid','Seed','Plan',7,10);
    `, `
      insert into auth.users(id,email) values
        ('22222222-2222-4222-8222-222222222222','sent@example.invalid'),
        ('33333333-3333-4333-8333-333333333333','out@example.invalid');
      insert into public.client_programs(client_email,client_name,program_title,session_count_used,session_count_total)
        values ('sent@example.invalid','Sent','Plan',6,10), ('out@example.invalid','Out','Plan',10,10);
      update public.client_programs set session_count_used=7 where client_email in ('sent@example.invalid','out@example.invalid');
    `);
    try {
      const key = backend === "legacy" ? "web_dedupe_key" : "dedupe_key";
      const countNotices = async () => (await db.query(`select count(*)::int as count from public.client_notifications where ${key} like 'client-session-balance:v2:%'`)).rows[0].count;
      assert.deepEqual((await db.query("select low_notified,out_notified from fwb_private.client_session_balance_state order by user_id")).rows, [
        { low_notified: false, out_notified: false },
        { low_notified: true, out_notified: false },
        { low_notified: true, out_notified: true }
      ]);
      assert.equal(await countNotices(), 2, "Changing the threshold sends no notices");
      await db.exec(`
        update public.client_programs set active=false,client_archived=true;
        insert into auth.users(id,email) values ('44444444-4444-4444-8444-444444444444','new@example.invalid');
        insert into public.client_programs(client_email,client_name,program_title,session_count_used,session_count_total)
          values ('seed@example.invalid','Seed','Copied plan',7,10), ('sent@example.invalid','Sent','Copied plan',7,10),
            ('out@example.invalid','Out','Copied plan',7,10), ('new@example.invalid','New','Plan',7,10);
      `);
      assert.equal(await countNotices(), 2, "New or copied three-session packages stay quiet");
      await db.exec(thresholdMigration);
      await db.exec("update public.client_programs set session_count_used=8 where active");
      assert.equal(await countNotices(), 4, "Seeded and new packages warn at two; sent packages do not repeat");
      assert.equal((await db.query(`select count(*)::int as count from public.client_notifications where ${key} like 'client-session-balance:v2:%' and title='2 coaching sessions remaining'`)).rows[0].count, 2);
      await db.exec("update public.client_programs set session_count_used=10 where active");
      assert.equal(await countNotices(), 7, "Each eligible package still receives one distinct out notice");
    } finally { await db.close(); }
  });

  test(`${backend}: rollout seeds private state without retroactive notices when existing low/out programs are copied`, {
    skip: !PGlite && "Install optional @electric-sql/pglite to run isolated database tests"
  }, async () => {
    const db = await database(backend, `
      insert into auth.users(id,email) values
        ('11111111-1111-4111-8111-111111111111','low@example.invalid'),
        ('22222222-2222-4222-8222-222222222222','out@example.invalid');
      insert into public.client_programs(client_email,client_name,program_title,session_count_used,session_count_total,updated_at)
        values ('low@example.invalid','Low','Old plan',5,10,'2026-01-01'),
          ('low@example.invalid','Low','Current plan',8,10,'2026-02-01'),
          ('out@example.invalid','Out','Current plan',10,10,'2026-02-01');
    `);
    try {
      const key = backend === "legacy" ? "web_dedupe_key" : "dedupe_key";
      assert.equal((await db.query(`select count(*)::int as count from public.client_notifications where ${key} like 'client-session-balance:v2:%'`)).rows[0].count, 0);
      assert.deepEqual((await db.query("select used,low_notified,out_notified from fwb_private.client_session_balance_state order by used")).rows, [
        { used: 8, low_notified: true, out_notified: false },
        { used: 10, low_notified: true, out_notified: true }
      ]);
      await db.exec(`
        update public.client_programs set active=false,client_archived=true;
        insert into public.client_programs(client_email,client_name,program_title,session_count_used,session_count_total)
          values ('low@example.invalid','Low','Copied plan',8,10),
            ('out@example.invalid','Out','Copied plan',10,10);
      `);
      assert.equal((await db.query(`select count(*)::int as count from public.client_notifications where ${key} like 'client-session-balance:v2:%'`)).rows[0].count, 0);
      await db.exec("update public.client_programs set session_count_used=10 where client_email='low@example.invalid' and active");
      assert.equal((await db.query(`select count(*)::int as count from public.client_notifications where ${key} like 'client-session-balance:v2:%'`)).rows[0].count, 1);
      await db.exec(currentMigrations);
      assert.equal((await db.query(`select count(*)::int as count from public.client_notifications where ${key} like 'client-session-balance:v2:%'`)).rows[0].count, 1);
    } finally { await db.close(); }
  });

  test(`${backend}: real triggers cover low/out transitions, fanout, renewal, preferences, missing counts and rollback`, {
    skip: !PGlite && "Install optional @electric-sql/pglite to run isolated database tests"
  }, async () => {
    const db = await database(backend);
    try {
      await db.exec(currentMigrations); // Reapplication cannot restore the old duplicate client producer.
      await db.exec(integration);
      assert.equal((await db.query("select count(*)::int as count from auth.users")).rows[0].count, 0);
      assert.equal((await db.query("select count(*)::int as count from public.client_notifications")).rows[0].count, 0);
      assert.equal((await db.query("select count(*)::int as count from fwb_private.client_session_balance_state")).rows[0].count, 0);
    } finally { await db.close(); }
  });

  test(`${backend}: replacing only the client producer preserves the existing coach threshold`, {
    skip: !PGlite && "Install optional @electric-sql/pglite to run isolated database tests"
  }, async () => {
    const db = await database(backend);
    try {
      const coach = "33333333-3333-4333-8333-333333333333";
      const client = "11111111-1111-4111-8111-111111111111";
      await db.exec(`insert into auth.users(id,email) values ('${coach}','benjaminbenz.fit@gmail.com'),('${client}','test@example.invalid')`);
      if (backend === "legacy") await db.exec(`insert into public.fwb_notification_settings(user_id) values ('${coach}'),('${client}')`);
      await db.exec("insert into public.client_programs(client_email,client_name,program_title,session_count_used,session_count_total) values ('test@example.invalid','Test','Plan',6,10)");
      await db.exec("update public.client_programs set session_count_used=7,updated_at=clock_timestamp()");
      assert.equal((await db.query("select count(*)::int as count from public.client_notifications where user_id=$1", [coach])).rows[0].count, 0);
      await db.exec("update public.client_programs set session_count_used=8,updated_at=clock_timestamp()");
      assert.equal((await db.query("select count(*)::int as count from public.client_notifications where user_id=$1", [coach])).rows[0].count, backend === "legacy" ? 1 : 0);
      await db.exec("update public.client_programs set session_count_used=9,updated_at=clock_timestamp()");
      assert.equal((await db.query("select count(*)::int as count from public.client_notifications where user_id=$1", [coach])).rows[0].count, 1);
      const key = backend === "legacy" ? "web_dedupe_key" : "dedupe_key";
      assert.equal((await db.query(`select count(*)::int as count from public.client_notifications where user_id=$1 and ${key} like 'client-session-balance:v2:%'`, [client])).rows[0].count, 1);
      assert.equal((await db.query(`select count(*)::int as count from public.client_notifications where user_id=$1 and ${key} like ${backend === "legacy" ? "'balance:%'" : "'client-session-balance:%'"} and ${key} not like 'client-session-balance:v2:%'`, [client])).rows[0].count, 0);
    } finally { await db.close(); }
  });
}
