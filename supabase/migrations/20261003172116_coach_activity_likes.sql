-- Let the coach acknowledge meaningful client activity and notify the client.
-- Reactions are anchored to coach notifications so the browser cannot invent
-- an activity or choose an arbitrary recipient.

alter table public.client_notifications
  drop constraint if exists client_notifications_kind_check;

alter table public.client_notifications
  add constraint client_notifications_kind_check check (
    kind in (
      'coach_reply',
      'coach_reaction',
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

alter table public.client_notification_preferences
  add column if not exists client_achievements boolean not null default true;

create table public.client_achievement_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null check (
    client_email = lower(btrim(client_email))
    and client_email <> ''
    and char_length(client_email) <= 320
  ),
  badge_id text not null check (badge_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  badge_title text not null check (char_length(btrim(badge_title)) between 1 and 120),
  earned_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, badge_id, earned_on)
);

alter table public.client_achievement_events enable row level security;
revoke all on table public.client_achievement_events from public, anon, authenticated;
grant select, insert on table public.client_achievement_events to authenticated;

create policy "Clients read their achievement events"
  on public.client_achievement_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Clients record their achievement events"
  on public.client_achievement_events
  for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and client_email = lower(btrim(coalesce((select auth.jwt()) ->> 'email', '')))
  );

create policy "Coaches read client achievement events"
  on public.client_achievement_events
  for select
  to authenticated
  using ((select public.is_coach_admin()));

create or replace function private.fwb_achievement_event_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_label text;
begin
  select nullif(btrim(regexp_replace(program.client_name, '\s+', ' ', 'g')), '')
    into client_label
    from public.client_programs as program
   where lower(btrim(program.client_email)) = new.client_email
   order by (program.client_archived is not true) desc,
            (program.active is not false) desc,
            program.updated_at desc nulls last,
            program.created_at desc nulls last,
            program.id
   limit 1;
  client_label := left(coalesce(client_label, nullif(split_part(new.client_email, '@', 1), ''), 'Client'), 100);

  perform private.fwb_queue_notification(
    'benjaminbenz.fit@gmail.com',
    'coach',
    'achievement',
    left(client_label || ' earned ' || new.badge_title, 160),
    'Open FWB Coach to celebrate this new badge.',
    '/coach-admin.html?tab=notifications',
    'coach-achievement:' || new.id::text,
    jsonb_build_object(
      'client_email', new.client_email,
      'activity_type', 'badge',
      'achievement_event_id', new.id,
      'badge_id', new.badge_id,
      'badge_title', new.badge_title,
      'earned_on', new.earned_on
    )
  );
  return new;
end;
$$;

revoke all on function private.fwb_achievement_event_notification() from public, anon, authenticated;

create trigger fwb_achievement_event_notifications
after insert on public.client_achievement_events
for each row execute function private.fwb_achievement_event_notification();

create table public.coach_activity_likes (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  client_user_id uuid not null references auth.users(id) on delete cascade,
  source_notification_id uuid not null references public.client_notifications(id) on delete cascade,
  activity_type text not null check (
    activity_type in ('workout', 'daily_checkin', 'weekly_checkin', 'gym_checkin', 'badge')
  ),
  client_email text not null check (
    client_email = lower(btrim(client_email))
    and client_email <> ''
    and char_length(client_email) <= 320
  ),
  created_at timestamptz not null default now(),
  unique (coach_user_id, source_notification_id)
);

create index coach_activity_likes_client_created_idx
  on public.coach_activity_likes (client_user_id, created_at desc);

alter table public.coach_activity_likes enable row level security;
revoke all on table public.coach_activity_likes from public, anon, authenticated;
grant select on table public.coach_activity_likes to authenticated;

create policy "Coach reads their activity likes"
  on public.coach_activity_likes
  for select
  to authenticated
  using (
    (select auth.uid()) = coach_user_id
    and (select public.is_coach_admin())
  );

create policy "Clients read likes on their activity"
  on public.coach_activity_likes
  for select
  to authenticated
  using ((select auth.uid()) = client_user_id);

create or replace function public.toggle_client_activity_like(p_notification_id uuid)
returns table (liked boolean, reaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  source_notice public.client_notifications%rowtype;
  target_user_id uuid;
  target_email text;
  reaction public.coach_activity_likes%rowtype;
  resolved_type text;
  reaction_title text;
  client_url text;
begin
  if actor_id is null or not coalesce(public.is_coach_admin(), false) then
    raise exception 'Coach access required' using errcode = '42501';
  end if;

  select notification.* into source_notice
    from public.client_notifications as notification
   where notification.id = p_notification_id
     and notification.user_id = actor_id
     and notification.recipient_role = 'coach'
     and notification.kind in ('workout_completed', 'check_in_submitted', 'achievement');

  if source_notice.id is null then
    raise exception 'Activity is unavailable' using errcode = '22023';
  end if;

  target_email := lower(btrim(coalesce(source_notice.metadata ->> 'client_email', '')));
  target_user_id := private.fwb_notification_user_id(target_email);
  if target_email = '' or target_user_id is null then
    raise exception 'Client account is unavailable' using errcode = '22023';
  end if;

  resolved_type := case source_notice.kind
    when 'workout_completed' then 'workout'
    when 'achievement' then 'badge'
    else case lower(coalesce(source_notice.metadata ->> 'check_in_type', ''))
      when 'gym' then 'gym_checkin'
      when 'weekly' then 'weekly_checkin'
      else 'daily_checkin'
    end
  end;

  delete from public.coach_activity_likes as existing
   where existing.coach_user_id = actor_id
     and existing.source_notification_id = source_notice.id
  returning existing.* into reaction;

  if reaction.id is not null then
    return query select false, reaction.id;
    return;
  end if;

  insert into public.coach_activity_likes (
    coach_user_id, client_user_id, source_notification_id, activity_type, client_email
  ) values (
    actor_id, target_user_id, source_notice.id, resolved_type, target_email
  )
  returning * into reaction;

  reaction_title := case resolved_type
    when 'workout' then 'Benjamin liked your workout'
    when 'weekly_checkin' then 'Benjamin liked your weekly check-in'
    when 'daily_checkin' then 'Benjamin liked your daily check-in'
    when 'gym_checkin' then 'Benjamin liked your gym check-in'
    else 'Benjamin liked your new badge'
  end;
  client_url := case resolved_type
    when 'workout' then '/client-dashboard.html?tab=logs'
    when 'badge' then '/client-dashboard.html?tab=progress'
    else '/client-dashboard.html?tab=home'
  end;

  perform private.fwb_queue_notification_for_user(
    target_user_id,
    'client',
    'coach_reaction',
    reaction_title,
    'Nice work—your coach saw this and sent some encouragement.',
    client_url,
    'coach-activity-like:' || reaction.id::text,
    jsonb_build_object(
      'activity_type', resolved_type,
      'source_notification_id', source_notice.id,
      'reaction_id', reaction.id
    )
  );

  return query select true, reaction.id;
end;
$$;

revoke all on function public.toggle_client_activity_like(uuid) from public, anon;
grant execute on function public.toggle_client_activity_like(uuid) to authenticated;
