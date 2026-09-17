-- Browser push notifications and in-app notification centers for clients and coach.
-- Push bodies intentionally avoid measurements, health answers, and other private details.

create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'general',
  title text not null check (char_length(title) between 1 and 160),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.client_notifications
  drop constraint if exists client_notifications_kind_check;

alter table public.client_notifications
  add constraint client_notifications_kind_check check (
    kind in (
      'coach_reply',
      'program_update',
      'nutrition_plan_update',
      'session_reminder',
      'workout_reminder',
      'weekly_check_in',
      'monthly_report',
      'session_balance',
      'nutrition_reminder',
      'progress_reminder',
      'achievement',
      'workout_completed',
      'check_in_submitted',
      'progress_submitted',
      'dexa_uploaded',
      'questionnaire_submitted',
      'coach_request',
      'workout_comment',
      'form_check_submitted',
      'form_check_feedback',
      'nutrition_activity',
      'client_inactive',
      'general'
    )
  );

alter table public.client_notifications
  add column if not exists recipient_role text not null default 'client',
  add column if not exists action_url text not null default '/client-dashboard.html?tab=home',
  add column if not exists dedupe_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists push_attempted_at timestamptz,
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_suppressed_at timestamptz,
  add column if not exists push_attempt_count smallint not null default 0,
  add column if not exists push_error text;

alter table public.client_notifications
  drop constraint if exists client_notifications_recipient_role_check,
  add constraint client_notifications_recipient_role_check
    check (recipient_role in ('client', 'coach')),
  drop constraint if exists client_notifications_action_url_check,
  add constraint client_notifications_action_url_check
    check (
      action_url ~ '^/[A-Za-z0-9._~!$&''()*+,;=:@/?%#-]*$'
      and action_url !~ '^//'
    ),
  drop constraint if exists client_notifications_dedupe_key_check,
  add constraint client_notifications_dedupe_key_check
    check (dedupe_key is null or char_length(dedupe_key) between 1 and 300),
  drop constraint if exists client_notifications_metadata_check,
  add constraint client_notifications_metadata_check
    check (jsonb_typeof(metadata) = 'object'),
  drop constraint if exists client_notifications_push_attempt_count_check,
  add constraint client_notifications_push_attempt_count_check
    check (push_attempt_count between 0 and 10),
  drop constraint if exists client_notifications_push_error_check,
  add constraint client_notifications_push_error_check
    check (push_error is null or char_length(push_error) <= 500);

create index if not exists client_notifications_user_created_idx
  on public.client_notifications (user_id, created_at desc);

create index if not exists client_notifications_user_unread_idx
  on public.client_notifications (user_id, created_at desc)
  where read_at is null;

create unique index if not exists client_notifications_user_dedupe_idx
  on public.client_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists client_notifications_pending_push_idx
  on public.client_notifications (created_at)
  where push_sent_at is null and push_suppressed_at is null;

alter table public.client_notifications enable row level security;

drop policy if exists "Clients can read their notifications" on public.client_notifications;
drop policy if exists "Users can read their notifications" on public.client_notifications;
create policy "Users can read their notifications"
  on public.client_notifications
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Coach can create client notifications" on public.client_notifications;
create policy "Coach can create client notifications"
  on public.client_notifications
  for insert
  to authenticated
  with check ((select public.is_coach_admin()));

drop policy if exists "Clients can mark their notifications read" on public.client_notifications;
drop policy if exists "Users can mark their notifications read" on public.client_notifications;
create policy "Users can mark their notifications read"
  on public.client_notifications
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Coach can delete client notifications" on public.client_notifications;

revoke all on table public.client_notifications from public, anon, authenticated;
grant select on table public.client_notifications to authenticated;
grant update (read_at) on table public.client_notifications to authenticated;
grant insert on table public.client_notifications to authenticated;

create table if not exists public.client_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  coach_replies boolean not null default true,
  program_updates boolean not null default true,
  workout_reminders boolean not null default true,
  achievements boolean not null default true,
  weekly_check_ins boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_notification_preferences
  add column if not exists push_enabled boolean not null default true,
  add column if not exists session_reminders boolean not null default true,
  add column if not exists monthly_reports boolean not null default true,
  add column if not exists session_balance boolean not null default true,
  add column if not exists nutrition_reminders boolean not null default true,
  add column if not exists progress_reminders boolean not null default true,
  add column if not exists client_workout_completed boolean not null default true,
  add column if not exists client_check_ins boolean not null default true,
  add column if not exists client_progress_updates boolean not null default true,
  add column if not exists client_dexa_uploads boolean not null default true,
  add column if not exists client_questionnaires boolean not null default true,
  add column if not exists client_coach_requests boolean not null default true,
  add column if not exists client_session_balance boolean not null default true,
  add column if not exists client_workout_comments boolean not null default true,
  add column if not exists client_form_checks boolean not null default true,
  add column if not exists client_nutrition_activity boolean not null default true,
  add column if not exists client_inactivity boolean not null default true,
  add column if not exists timezone text not null default 'America/Los_Angeles',
  add column if not exists weekly_check_in_day smallint not null default 0,
  add column if not exists weekly_check_in_time time not null default '18:00',
  add column if not exists workout_reminder_days smallint[] not null default '{1,3,5}',
  add column if not exists workout_reminder_time time not null default '17:00',
  add column if not exists nutrition_reminder_time time not null default '19:00',
  add column if not exists progress_reminder_day smallint not null default 1,
  add column if not exists progress_reminder_time time not null default '09:00',
  add column if not exists session_reminder_time time not null default '18:00',
  add column if not exists nutrition_digest_time time not null default '20:00';

alter table public.client_notification_preferences
  drop constraint if exists client_notification_preferences_timezone_check,
  add constraint client_notification_preferences_timezone_check
    check (char_length(timezone) between 1 and 80),
  drop constraint if exists client_notification_preferences_weekday_check,
  add constraint client_notification_preferences_weekday_check
    check (weekly_check_in_day between 0 and 6),
  drop constraint if exists client_notification_preferences_progress_day_check,
  add constraint client_notification_preferences_progress_day_check
    check (progress_reminder_day between 1 and 28);

alter table public.client_notification_preferences enable row level security;

drop policy if exists "Clients can read notification preferences" on public.client_notification_preferences;
drop policy if exists "Users can read notification preferences" on public.client_notification_preferences;
create policy "Users can read notification preferences"
  on public.client_notification_preferences
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Clients can create notification preferences" on public.client_notification_preferences;
drop policy if exists "Users can create notification preferences" on public.client_notification_preferences;
create policy "Users can create notification preferences"
  on public.client_notification_preferences
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Clients can update notification preferences" on public.client_notification_preferences;
drop policy if exists "Users can update notification preferences" on public.client_notification_preferences;
create policy "Users can update notification preferences"
  on public.client_notification_preferences
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.client_notification_preferences from public, anon, authenticated;
grant select, insert, update on table public.client_notification_preferences to authenticated;

-- Existing accounts should receive the same all-enabled defaults as new accounts.
-- Browser permission is still requested only after an explicit user gesture.
insert into public.client_notification_preferences (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null check (char_length(endpoint) between 20 and 2048),
  p256dh text not null check (char_length(p256dh) between 20 and 300),
  auth text not null check (char_length(auth) between 8 and 300),
  expiration_time bigint,
  user_agent text not null default '' check (char_length(user_agent) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- A browser push endpoint is a delivery capability and must never remain active
-- for two accounts after a shared device changes users.
with ranked_subscriptions as (
  select id,
         row_number() over (
           partition by endpoint
           order by is_active desc, last_seen_at desc, created_at desc, id desc
         ) as endpoint_rank
    from public.web_push_subscriptions
)
delete from public.web_push_subscriptions subscriptions
 using ranked_subscriptions ranked
 where subscriptions.id = ranked.id
   and ranked.endpoint_rank > 1;

create unique index if not exists web_push_subscriptions_endpoint_idx
  on public.web_push_subscriptions (endpoint);

create or replace function private.fwb_reassign_web_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_subscription public.web_push_subscriptions%rowtype;
begin
  if (select auth.uid()) is null or (select auth.uid()) <> new.user_id then
    raise insufficient_privilege using message = 'Push subscriptions may only be registered for the signed-in user.';
  end if;

  select *
    into prior_subscription
    from public.web_push_subscriptions
   where endpoint = new.endpoint
     and user_id <> new.user_id
   for update;

  if found then
    if prior_subscription.p256dh <> new.p256dh or prior_subscription.auth <> new.auth then
      raise invalid_parameter_value using message = 'Push subscription keys do not match the existing endpoint.';
    end if;

    delete from public.web_push_subscriptions
     where id = prior_subscription.id;
  end if;

  return new;
end;
$$;

revoke all on function private.fwb_reassign_web_push_subscription() from public, anon, authenticated;

drop trigger if exists fwb_reassign_web_push_subscription on public.web_push_subscriptions;
create trigger fwb_reassign_web_push_subscription
before insert on public.web_push_subscriptions
for each row execute function private.fwb_reassign_web_push_subscription();

create index if not exists web_push_subscriptions_delivery_idx
  on public.web_push_subscriptions (user_id, is_active);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users can read their web push subscriptions" on public.web_push_subscriptions;
create policy "Users can read their web push subscriptions"
  on public.web_push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their web push subscriptions" on public.web_push_subscriptions;
create policy "Users can create their web push subscriptions"
  on public.web_push_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their web push subscriptions" on public.web_push_subscriptions;
create policy "Users can update their web push subscriptions"
  on public.web_push_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their web push subscriptions" on public.web_push_subscriptions;
create policy "Users can delete their web push subscriptions"
  on public.web_push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.web_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.web_push_subscriptions to authenticated;

create table if not exists public.notification_dispatch_config (
  id smallint primary key default 1 check (id = 1),
  secret_hash text not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_dispatch_config enable row level security;
revoke all on table public.notification_dispatch_config from public, anon, authenticated;
grant select on table public.notification_dispatch_config to service_role;

do $$
declare
  dispatch_secret text;
begin
  select decrypted_secret
    into dispatch_secret
    from vault.decrypted_secrets
   where name = 'fwb_notification_dispatch_secret'
   limit 1;

  if dispatch_secret is null then
    dispatch_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(dispatch_secret, 'fwb_notification_dispatch_secret');
  end if;

  insert into public.notification_dispatch_config (id, secret_hash, updated_at)
  values (
    1,
    encode(extensions.digest(dispatch_secret, 'sha256'), 'hex'),
    now()
  )
  on conflict (id) do update
    set secret_hash = excluded.secret_hash,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function private.fwb_notification_user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
    from auth.users
   where lower(email) = lower(btrim(p_email))
   order by created_at
   limit 1;
$$;

create or replace function private.fwb_queue_notification(
  p_recipient_email text,
  p_recipient_role text,
  p_kind text,
  p_title text,
  p_body text,
  p_action_url text,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  recipient_id := private.fwb_notification_user_id(p_recipient_email);

  if recipient_id is null then
    return;
  end if;

  insert into public.client_notifications (
    user_id,
    recipient_role,
    kind,
    title,
    body,
    action_url,
    dedupe_key,
    metadata,
    expires_at
  )
  values (
    recipient_id,
    p_recipient_role,
    p_kind,
    left(p_title, 160),
    left(p_body, 2000),
    p_action_url,
    left(p_dedupe_key, 300),
    coalesce(p_metadata, '{}'::jsonb),
    p_expires_at
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function private.fwb_queue_notification_for_user(
  p_user_id uuid,
  p_recipient_role text,
  p_kind text,
  p_title text,
  p_body text,
  p_action_url text,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.client_notifications (
    user_id,
    recipient_role,
    kind,
    title,
    body,
    action_url,
    dedupe_key,
    metadata,
    expires_at
  )
  values (
    p_user_id,
    p_recipient_role,
    p_kind,
    left(p_title, 160),
    left(p_body, 2000),
    p_action_url,
    left(p_dedupe_key, 300),
    coalesce(p_metadata, '{}'::jsonb),
    p_expires_at
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

revoke all on function private.fwb_notification_user_id(text) from public, anon, authenticated;
revoke all on function private.fwb_queue_notification_for_user(uuid, text, text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function private.fwb_queue_notification(text, text, text, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;

create or replace function private.fwb_program_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_sessions integer;
  coach_email constant text := 'benjaminbenz.fit@gmail.com';
  change_stamp text := floor(extract(epoch from new.updated_at))::bigint::text;
begin
  if tg_op = 'INSERT' then
    if new.active is true and new.client_archived is false then
      perform private.fwb_queue_notification(
        new.client_email,
        'client',
        'program_update',
        'Your training plan is ready',
        'Open FWB to review the plan assigned by your coach.',
        '/client-dashboard.html?tab=workouts',
        'program-assigned:' || new.id::text,
        jsonb_build_object('program_id', new.id)
      );
    end if;

    return new;
  end if;

  if new.active is true
     and new.client_archived is false
     and (old.active is distinct from true or old.client_archived is distinct from false) then
    perform private.fwb_queue_notification(
      new.client_email,
      'client',
      'program_update',
      'Your training plan is ready',
      'Open FWB to review the plan assigned by your coach.',
      '/client-dashboard.html?tab=workouts',
      'program-activated:' || new.id::text || ':' || change_stamp,
      jsonb_build_object('program_id', new.id)
    );
  end if;

  if new.active is true
     and new.client_archived is false
     and (
       new.workouts is distinct from old.workouts
       or new.program_title is distinct from old.program_title
       or new.program_summary is distinct from old.program_summary
     ) then
    perform private.fwb_queue_notification(
      new.client_email,
      'client',
      'program_update',
      'Your training plan was updated',
      'Open FWB to review the latest workout plan from your coach.',
      '/client-dashboard.html?tab=workouts',
      'program-update:' || new.id::text || ':' || change_stamp,
      jsonb_build_object('program_id', new.id)
    );
  end if;

  if new.active is true
     and new.client_archived is false
     and new.nutrition_plan is distinct from old.nutrition_plan then
    perform private.fwb_queue_notification(
      new.client_email,
      'client',
      'nutrition_plan_update',
      'Your nutrition plan was updated',
      'Open FWB to review the latest nutrition guidance from your coach.',
      '/client-dashboard.html?tab=nutrition',
      'nutrition-plan-update:' || new.id::text || ':' || change_stamp,
      jsonb_build_object('program_id', new.id)
    );
  end if;

  if new.active is true
     and new.client_archived is false
     and (
       new.coach_note_title is distinct from old.coach_note_title
       or new.coach_note_body is distinct from old.coach_note_body
     ) then
    perform private.fwb_queue_notification(
      new.client_email,
      'client',
      'coach_reply',
      'You have a new coaching update',
      'Open FWB to read your private coaching update.',
      '/client-dashboard.html?tab=home',
      'coach-note:' || new.id::text || ':' || change_stamp,
      jsonb_build_object('program_id', new.id)
    );
  end if;

  if new.session_count_used is distinct from old.session_count_used
     or new.session_count_total is distinct from old.session_count_total then
    remaining_sessions := greatest(coalesce(new.session_count_total, 0) - coalesce(new.session_count_used, 0), 0);

    if new.session_count_total > 0 and remaining_sessions <= 1 then
      perform private.fwb_queue_notification(
        new.client_email,
        'client',
        'session_balance',
        case when remaining_sessions = 0 then 'Your session package is complete' else 'One coaching session remaining' end,
        'Open FWB to review your current coaching-session balance.',
        '/client-dashboard.html?tab=sessions',
        'client-session-balance:' || new.id::text || ':' || new.session_count_used::text || ':' || new.session_count_total::text,
        jsonb_build_object('program_id', new.id, 'remaining', remaining_sessions)
      );

      perform private.fwb_queue_notification(
        coach_email,
        'coach',
        'session_balance',
        'A client has a low session balance',
        'Open Coach Admin to review the client session package.',
        '/coach-admin.html?tab=sessions',
        'coach-session-balance:' || new.id::text || ':' || new.session_count_used::text || ':' || new.session_count_total::text,
        jsonb_build_object('program_id', new.id, 'client_email', new.client_email, 'remaining', remaining_sessions)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists fwb_program_notifications on public.client_programs;
create trigger fwb_program_notifications
after insert or update on public.client_programs
for each row execute function private.fwb_program_notification_trigger();

create or replace function private.fwb_workout_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workout_key text;
  actor_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if new.completed_at is null or (tg_op = 'UPDATE' and old.completed_at is not distinct from new.completed_at) then
    return new;
  end if;

  -- Coach/session-log edits must not masquerade as client activity.
  if actor_email <> lower(btrim(new.client_email)) then
    return new;
  end if;

  workout_key := coalesce(new.workout_session_id, new.session_id, new.id)::text;

  perform private.fwb_queue_notification(
    'benjaminbenz.fit@gmail.com',
    'coach',
    'workout_completed',
    'A client completed a workout',
    'Open Coach Admin to review the completed workout log.',
    '/coach-admin.html?tab=logs',
    'coach-workout-completed:' || workout_key,
    jsonb_build_object('client_email', new.client_email, 'session_id', workout_key)
  );

  perform private.fwb_queue_notification(
    new.client_email,
    'client',
    'achievement',
    'Workout saved — nice work',
    'Your completed workout and workout time are safely stored in FWB.',
    '/client-dashboard.html?tab=logs',
    'client-workout-saved:' || workout_key,
    jsonb_build_object('session_id', workout_key)
  );

  return new;
end;
$$;

drop trigger if exists fwb_workout_notifications on public.client_workout_logs;
create trigger fwb_workout_notifications
after insert or update of completed_at on public.client_workout_logs
for each row execute function private.fwb_workout_notification_trigger();

create or replace function private.fwb_check_in_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  coach_email constant text := 'benjaminbenz.fit@gmail.com';
begin
  if actor_email = lower(btrim(new.client_email))
     and (
       tg_op = 'INSERT'
       or (new.weekly_submitted_at is not null and old.weekly_submitted_at is distinct from new.weekly_submitted_at)
     ) then
    perform private.fwb_queue_notification(
      'benjaminbenz.fit@gmail.com',
      'coach',
      'check_in_submitted',
      'A client submitted a check-in',
      'Open Coach Admin to review the private client check-in.',
      '/coach-admin.html?tab=progress',
      'coach-check-in:' || new.id::text,
      jsonb_build_object('client_email', new.client_email, 'check_in_id', new.id)
    );
  end if;

  if actor_email = coach_email
     and new.coach_response is not null
     and btrim(new.coach_response) <> ''
     and (tg_op = 'INSERT' or old.coach_response is distinct from new.coach_response) then
    perform private.fwb_queue_notification(
      new.client_email,
      'client',
      'coach_reply',
      'Your coach replied to your check-in',
      'Open FWB to read the private response.',
      '/client-dashboard.html?tab=progress',
      'client-check-in-reply:' || new.id::text || ':' || floor(extract(epoch from coalesce(new.coach_responded_at, new.updated_at)))::bigint::text,
      jsonb_build_object('check_in_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists fwb_check_in_notifications on public.client_check_ins;
create trigger fwb_check_in_notifications
after insert or update on public.client_check_ins
for each row execute function private.fwb_check_in_notification_trigger();

create or replace function private.fwb_progress_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
begin
  if actor_email <> lower(btrim(new.client_email)) then
    return new;
  end if;

  perform private.fwb_queue_notification(
    'benjaminbenz.fit@gmail.com',
    'coach',
    'progress_submitted',
    'A client updated progress',
    'Open Coach Admin to review the client progress entry.',
    '/coach-admin.html?tab=progress',
    'coach-progress:' || new.id::text || ':' || new.entry_date::text,
    jsonb_build_object('client_email', new.client_email, 'progress_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists fwb_progress_notifications on public.client_progress;
create trigger fwb_progress_notifications
after insert or update on public.client_progress
for each row execute function private.fwb_progress_notification_trigger();

create or replace function private.fwb_dexa_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.fwb_queue_notification(
      'benjaminbenz.fit@gmail.com',
      'coach',
      'dexa_uploaded',
      'A client uploaded a DEXA report',
      'Open Coach Admin to review the private report status.',
      '/coach-admin.html?tab=progress',
      'coach-dexa-uploaded:' || new.id::text,
      jsonb_build_object('client_email', new.client_email, 'report_id', new.id)
    );
  end if;

  if new.status in ('ready', 'confirmed')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform private.fwb_queue_notification(
      new.client_email,
      'client',
      'progress_reminder',
      'Your DEXA report is ready',
      'Open FWB to review the private report and confirm the extracted measurements.',
      '/client-dashboard.html?tab=stats',
      'client-dexa-ready:' || new.id::text || ':' || new.status,
      jsonb_build_object('report_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists fwb_dexa_notifications on public.client_dexa_reports;
create trigger fwb_dexa_notifications
after insert or update of status on public.client_dexa_reports
for each row execute function private.fwb_dexa_notification_trigger();

create or replace function private.fwb_questionnaire_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.match_status <> 'matched'
     or (tg_op = 'UPDATE' and old.match_status = 'matched') then
    return new;
  end if;

  perform private.fwb_queue_notification(
    'benjaminbenz.fit@gmail.com',
    'coach',
    'questionnaire_submitted',
    'A client submitted a questionnaire',
    'Open Coach Admin to review the private fitness questionnaire.',
    '/coach-admin.html?tab=profile',
    'coach-questionnaire:' || new.id::text,
    jsonb_build_object('client_email', new.linked_client_email, 'questionnaire_id', new.id)
  );

  return new;
end;
$$;

drop trigger if exists fwb_questionnaire_notifications on public.client_fitness_questionnaires;
create trigger fwb_questionnaire_notifications
after insert or update of match_status on public.client_fitness_questionnaires
for each row execute function private.fwb_questionnaire_notification_trigger();

create or replace function private.fwb_coach_request_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.fwb_queue_notification(
    'benjaminbenz.fit@gmail.com',
    'coach',
    'coach_request',
    'A client sent a coaching request',
    'Open Coach Admin to review the private request.',
    '/coach-admin.html?tab=notes',
    'coach-request:' || new.id::text,
    jsonb_build_object('client_email', new.client_email, 'request_id', new.id, 'urgency', new.urgency)
  );

  return new;
end;
$$;

drop trigger if exists fwb_coach_request_notifications on public.coach_requests;
create trigger fwb_coach_request_notifications
after insert on public.coach_requests
for each row execute function private.fwb_coach_request_notification_trigger();

create or replace function private.fwb_workout_comment_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_row public.workout_comment_threads%rowtype;
begin
  select *
    into thread_row
    from public.workout_comment_threads
   where id = new.thread_id;

  if not found then
    return new;
  end if;

  if new.author_role = 'client' then
    perform private.fwb_queue_notification(
      'benjaminbenz.fit@gmail.com',
      'coach',
      'workout_comment',
      'A client added a workout comment',
      'Open Coach Admin to read and reply inside the private workout thread.',
      '/coach-admin.html?tab=logs',
      'coach-workout-comment:' || new.id::text,
      jsonb_build_object('thread_id', new.thread_id, 'comment_id', new.id)
    );
  elsif new.author_role = 'coach' then
    perform private.fwb_queue_notification_for_user(
      thread_row.client_user_id,
      'client',
      'workout_comment',
      'Your coach replied to a workout',
      'Open FWB to read the private workout comment.',
      '/client-dashboard.html?tab=logs',
      'client-workout-comment:' || new.id::text,
      jsonb_build_object('thread_id', new.thread_id, 'comment_id', new.id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists fwb_workout_comment_notifications on public.workout_comments;
create trigger fwb_workout_comment_notifications
after insert on public.workout_comments
for each row execute function private.fwb_workout_comment_notification_trigger();

create or replace function private.fwb_form_check_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.fwb_queue_notification(
      'benjaminbenz.fit@gmail.com',
      'coach',
      'form_check_submitted',
      'A client submitted a form check',
      'Open Coach Admin to review the private form-check submission.',
      '/coach-admin.html?tab=logs',
      'coach-form-check:' || new.id::text,
      jsonb_build_object('submission_id', new.id)
    );

    return new;
  end if;

  if new.status in ('reviewed', 'needs_resubmission')
     and (
       old.status is distinct from new.status
       or old.coach_feedback is distinct from new.coach_feedback
     ) then
    perform private.fwb_queue_notification_for_user(
      new.client_id,
      'client',
      'form_check_feedback',
      'Your form check was reviewed',
      'Open FWB to read the private feedback from your coach.',
      '/client-dashboard.html?tab=logs',
      'client-form-check:' || new.id::text || ':' || floor(extract(epoch from new.updated_at))::bigint::text,
      jsonb_build_object('submission_id', new.id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists fwb_form_check_notifications on public.form_check_submissions;
create trigger fwb_form_check_notifications
after insert or update of status, coach_feedback on public.form_check_submissions
for each row execute function private.fwb_form_check_notification_trigger();

revoke all on function private.fwb_program_notification_trigger() from public, anon, authenticated;
revoke all on function private.fwb_workout_notification_trigger() from public, anon, authenticated;
revoke all on function private.fwb_check_in_notification_trigger() from public, anon, authenticated;
revoke all on function private.fwb_progress_notification_trigger() from public, anon, authenticated;
revoke all on function private.fwb_dexa_notification_trigger() from public, anon, authenticated;
revoke all on function private.fwb_questionnaire_notification_trigger() from public, anon, authenticated;
revoke all on function private.fwb_coach_request_notification_trigger() from public, anon, authenticated;
revoke all on function private.fwb_workout_comment_notification_trigger() from public, anon, authenticated;
revoke all on function private.fwb_form_check_notification_trigger() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fwb-web-push-dispatch') then
    perform cron.unschedule('fwb-web-push-dispatch');
  end if;
end;
$$;

select cron.schedule(
  'fwb-web-push-dispatch',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://qukdfjeupjhpthfbaonv.supabase.co/functions/v1/send-web-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-FWB-Dispatch-Secret', (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'fwb_notification_dispatch_secret'
           limit 1
        )
      ),
      body := jsonb_build_object('action', 'dispatch'),
      timeout_milliseconds := 15000
    );
  $cron$
);
