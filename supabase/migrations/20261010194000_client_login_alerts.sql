-- Record an intentional, recent client sign-in in the coach inbox.
-- The caller cannot choose a client or coach identity; both come from auth.

alter table public.client_notifications
  drop constraint if exists client_notifications_kind_check;

alter table public.client_notifications
  add constraint client_notifications_kind_check check (
    kind in (
      'coach_reply', 'coach_reaction', 'program_update', 'nutrition_plan_update',
      'session_reminder', 'workout_reminder', 'weekly_check_in', 'monthly_report',
      'session_balance', 'nutrition_reminder', 'progress_reminder', 'achievement',
      'workout_completed', 'check_in_submitted', 'progress_submitted',
      'dexa_uploaded', 'questionnaire_submitted', 'coach_request',
      'workout_comment', 'form_check_submitted', 'form_check_feedback',
      'nutrition_activity', 'client_inactive', 'client_login', 'general'
    )
  );

do $$
begin
  if to_regclass('public.client_notification_preferences') is not null then
    alter table public.client_notification_preferences
      add column if not exists client_logins boolean not null default true;
  end if;
end;
$$;

create or replace function public.record_client_login_notification()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  signed_in_user_id uuid := auth.uid();
  signed_in_email text;
  signed_in_at timestamptz;
  coach_id uuid;
  program_id uuid;
  program_name text;
  notification_body text;
  notification_url text;
  notification_key text;
begin
  if signed_in_user_id is null then
    raise exception 'Client sign-in required' using errcode = '42501';
  end if;

  select lower(btrim(user_record.email)), user_record.last_sign_in_at
    into signed_in_email, signed_in_at
    from auth.users as user_record
   where user_record.id = signed_in_user_id
     and user_record.deleted_at is null;

  -- A restored session or an old token is not a fresh sign-in.
  if signed_in_email is null or signed_in_at is null
     or signed_in_at < now() - interval '3 minutes'
     or signed_in_at > now() + interval '1 minute' then
    return false;
  end if;

  select program.id, nullif(btrim(regexp_replace(program.client_name, '\s+', ' ', 'g')), '')
    into program_id, program_name
    from public.client_programs as program
   where lower(btrim(program.client_email)) = signed_in_email
     and program.active is true
     and program.client_archived is not true
   order by program.updated_at desc, program.id
   limit 1;
  if program_id is null then
    return false;
  end if;

  select user_record.id into coach_id
    from auth.users as user_record
   where lower(btrim(user_record.email)) = 'benjaminbenz.fit@gmail.com'
     and user_record.deleted_at is null
   limit 1;
  if coach_id is null or coach_id = signed_in_user_id then
    return false;
  end if;

  notification_body := left(coalesce(program_name, 'A client'), 100) || ' signed in to FWB Training.';
  notification_url := '/coach-admin.html?client=' || program_id::text || '&tab=profile';
  notification_key := 'client-login:' || signed_in_user_id::text || ':' ||
    to_char(signed_in_at at time zone 'UTC', 'YYYYMMDDHH24MISSUS');

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'client_notifications'
       and column_name = 'web_dedupe_key'
  ) then
    insert into public.client_notifications
      (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
    values
      (coach_id, 'client_login', 'Client signed in', notification_body,
       'client_login', notification_url, notification_key)
    on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing;
  else
    insert into public.client_notifications
      (user_id, recipient_role, kind, title, body, action_url, dedupe_key)
    values
      (coach_id, 'coach', 'client_login', 'Client signed in',
       notification_body, notification_url, notification_key)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return true;
end;
$$;

revoke all on function public.record_client_login_notification() from public, anon;
grant execute on function public.record_client_login_notification() to authenticated;
