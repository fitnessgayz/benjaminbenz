const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let PGlite;
try {
  ({ PGlite } = require(process.env.ACTIVITY_LIKES_PGLITE_PATH || "@electric-sql/pglite"));
} catch {}

const migration = fs.readFileSync(path.join(
  __dirname,
  "../supabase/migrations/20261003172116_coach_activity_likes.sql"
), "utf8");

test("Postgres securely toggles a coach like and queues client encouragement", {
  skip: !PGlite && "Install @electric-sql/pglite or set ACTIVITY_LIKES_PGLITE_PATH"
}, async () => {
  const db = new PGlite();
  const coach = "11111111-1111-4111-8111-111111111111";
  const client = "22222222-2222-4222-8222-222222222222";
  const notice = "33333333-3333-4333-8333-333333333333";

  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create schema private;
    create table auth.users (
      id uuid primary key,
      email text not null,
      created_at timestamptz not null default now(),
      deleted_at timestamptz
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object('email', current_setting('request.jwt.claim.email', true))
    $$;
    create function public.is_coach_admin() returns boolean language sql stable as $$
      select lower(current_setting('request.jwt.claim.email', true)) = 'benjaminbenz.fit@gmail.com'
    $$;
    create table public.client_notifications (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      kind text not null default 'general',
      title text not null,
      body text not null,
      created_at timestamptz not null default now(),
      read_at timestamptz,
      recipient_role text not null default 'client',
      action_url text not null default '/client-dashboard.html?tab=home',
      dedupe_key text,
      metadata jsonb not null default '{}'::jsonb,
      expires_at timestamptz,
      push_attempted_at timestamptz,
      push_sent_at timestamptz,
      push_suppressed_at timestamptz,
      push_attempt_count smallint not null default 0,
      push_error text
    );
    create unique index client_notifications_user_dedupe_idx
      on public.client_notifications(user_id, dedupe_key) where dedupe_key is not null;
    grant select on public.client_notifications to authenticated;
    create table public.client_notification_preferences (
      user_id uuid primary key references auth.users(id),
      push_enabled boolean not null default true
    );
    create table public.client_programs (
      id uuid primary key default gen_random_uuid(),
      client_email text not null,
      client_name text,
      active boolean default true,
      client_archived boolean default false,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
    create function private.fwb_notification_user_id(p_email text) returns uuid
      language sql stable security definer set search_path = '' as $$
        select id from auth.users where lower(email) = lower(btrim(p_email)) order by created_at limit 1
      $$;
    create function private.fwb_queue_notification_for_user(
      p_user_id uuid, p_recipient_role text, p_kind text, p_title text, p_body text,
      p_action_url text, p_dedupe_key text, p_metadata jsonb default '{}'::jsonb,
      p_expires_at timestamptz default null
    ) returns void language plpgsql security definer set search_path = '' as $$
    begin
      insert into public.client_notifications
        (user_id, recipient_role, kind, title, body, action_url, dedupe_key, metadata, expires_at)
      values
        (p_user_id, p_recipient_role, p_kind, p_title, p_body, p_action_url, p_dedupe_key, p_metadata, p_expires_at)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    end $$;
    create function private.fwb_queue_notification(
      p_recipient_email text, p_recipient_role text, p_kind text, p_title text, p_body text,
      p_action_url text, p_dedupe_key text, p_metadata jsonb default '{}'::jsonb,
      p_expires_at timestamptz default null
    ) returns void language plpgsql security definer set search_path = '' as $$
    declare target uuid;
    begin
      target := private.fwb_notification_user_id(p_recipient_email);
      perform private.fwb_queue_notification_for_user(target, p_recipient_role, p_kind, p_title,
        p_body, p_action_url, p_dedupe_key, p_metadata, p_expires_at);
    end $$;
  `);

  await db.exec(migration);
  await db.query("insert into auth.users(id,email) values ($1,'benjaminbenz.fit@gmail.com'),($2,'client@example.com')", [coach, client]);
  await db.query("insert into public.client_programs(client_email,client_name) values ('client@example.com','Alex Rivera')");
  await db.query(`insert into public.client_notifications
    (id,user_id,recipient_role,kind,title,body,action_url,dedupe_key,metadata)
    values ($1,$2,'coach','workout_completed','Workout completed','Open the log.',
      '/coach-admin.html?tab=logs','source-workout',jsonb_build_object('client_email','client@example.com'))`, [notice, coach]);

  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.email','benjaminbenz.fit@gmail.com',false)", [coach]);
  const first = await db.query("select * from public.toggle_client_activity_like($1)", [notice]);
  assert.equal(first.rows[0].liked, true);
  assert.equal((await db.query("select count(*)::int as count from public.coach_activity_likes")).rows[0].count, 1);
  const encouragement = await db.query("select kind,title,user_id from public.client_notifications where recipient_role='client'");
  assert.equal(encouragement.rows.length, 1);
  assert.equal(encouragement.rows[0].kind, "coach_reaction");
  assert.equal(encouragement.rows[0].title, "Benjamin liked your workout");
  assert.equal(encouragement.rows[0].user_id, client);

  const second = await db.query("select * from public.toggle_client_activity_like($1)", [notice]);
  assert.equal(second.rows[0].liked, false);
  assert.equal((await db.query("select count(*)::int as count from public.coach_activity_likes")).rows[0].count, 0);
  assert.equal((await db.query("select count(*)::int as count from public.client_notifications where recipient_role='client'")).rows[0].count, 1);

  await db.exec("reset role");
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.email','client@example.com',false)", [client]);
  await db.query(`insert into public.client_achievement_events
    (user_id,client_email,badge_id,badge_title,earned_on)
    values ($1,'client@example.com','workout-5','Momentum','2026-10-03')`, [client]);
  await db.exec("reset role");
  const badgeNotice = await db.query("select kind,title,metadata from public.client_notifications where recipient_role='coach' and kind='achievement'");
  assert.equal(badgeNotice.rows.length, 1);
  assert.equal(badgeNotice.rows[0].title, "Alex Rivera earned Momentum");
  assert.equal(badgeNotice.rows[0].metadata.activity_type, "badge");
  assert.equal(badgeNotice.rows[0].metadata.badge_title, "Momentum");

  await db.close();
});
