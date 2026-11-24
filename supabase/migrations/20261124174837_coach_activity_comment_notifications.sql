-- Coach comments are in-app notifications only. Resolve the recipient from an
-- owned activity notice, completed workout row, or still-visible Wall post.
create schema if not exists coach_activity_private;
revoke all on schema coach_activity_private from public, anon, authenticated;
grant usage on schema coach_activity_private to authenticated;

create function coach_activity_private.send_coach_activity_comment(
  p_notification_id uuid, p_workout_log_id uuid, p_body text, p_request_id uuid,
  p_wall_event_id text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  source_notice public.client_notifications%rowtype;
  source_payload jsonb;
  source_kind text;
  target_email text;
  wall_owner_id uuid;
  recipient_id uuid;
  notice_id uuid;
  notice_title text;
  notice_url text;
  notice_key text;
  clean_body text;
begin
  if actor_id is null or not coalesce(public.is_coach_admin(), false)
     or coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'Coach access required' using errcode = '42501';
  end if;
  if p_request_id is null or num_nonnulls(p_notification_id, p_workout_log_id, p_wall_event_id) <> 1
     or (p_wall_event_id is not null and char_length(p_wall_event_id) not between 1 and 140)
     or p_body is null or char_length(p_body) > 2000 then
    raise exception 'Invalid comment request' using errcode = '22023';
  end if;
  clean_body := regexp_replace(p_body, '^[[:space:]]+|[[:space:]]+$', '', 'g');
  if char_length(clean_body) not between 1 and 500 then
    raise exception 'Enter a comment up to 500 characters.' using errcode = '22023';
  end if;

  if p_notification_id is not null then
    select notice.* into source_notice
      from public.client_notifications as notice
      where notice.id = p_notification_id and notice.user_id = actor_id;
    source_payload := to_jsonb(source_notice);
    source_kind := coalesce(nullif(source_payload ->> 'web_category', ''), source_notice.kind);
    if source_notice.id is null or coalesce(source_payload ->> 'recipient_role', 'coach') <> 'coach'
       or source_kind is null or source_kind not in ('workout_completed', 'check_in_submitted', 'achievement') then
      raise exception 'Activity is unavailable' using errcode = 'P0002';
    end if;
    target_email := private.fwb_activity_client_email(source_notice);
  elsif p_workout_log_id is not null then
    select lower(btrim(log.client_email)) into target_email
      from public.client_workout_logs as log
      where log.id = p_workout_log_id and log.completed_at is not null;
    source_kind := 'workout_completed';
  else
    -- Check the current feed projection, so removed or no-longer-shared posts
    -- cannot be used as private notification targets.
    select distinct event.owner_id, lower(btrim(member.email)), case visible.event_type
      when 'workout' then 'workout_completed'
      when 'gym_visit' then 'check_in_submitted'
      when 'daily_challenge' then 'achievement'
      when 'weekly_challenge' then 'achievement'
      else 'wall_activity'
    end into strict wall_owner_id, target_email, source_kind
    from community_private.community_wall_events() as event
    join community_private.community_wall_feed() as visible on visible.event_id = event.event_id
    join auth.users as member on member.id = event.owner_id
    where visible.event_id = p_wall_event_id and not visible.is_own;
  end if;

  if coalesce(target_email, '') = '' or not exists (
    select 1 from public.client_programs as program
      where lower(btrim(program.client_email)) = target_email
        and program.client_archived is not true and program.active is not false
  ) then
    raise exception 'Client account is unavailable' using errcode = 'P0002';
  end if;

  select min(member.id::text)::uuid into recipient_id from auth.users as member
    where lower(btrim(member.email)) = target_email and member.deleted_at is null
      and member.is_anonymous is not true and member.id <> actor_id
      and (wall_owner_id is null or member.id = wall_owner_id)
    having count(*) = 1;
  if recipient_id is null then
    raise exception 'Client account is unavailable' using errcode = 'P0002';
  end if;

  notice_title := case source_kind
    when 'workout_completed' then 'Your coach commented on your workout'
    when 'check_in_submitted' then 'Your coach commented on your check-in'
    when 'achievement' then 'Your coach commented on your achievement'
    else 'Your coach commented on a post you shared'
  end;
  notice_url := case source_kind
    when 'workout_completed' then '/client-dashboard.html?tab=logs'
    when 'achievement' then '/client-dashboard.html?tab=progress'
    else '/client-dashboard.html?tab=home'
  end;
  notice_key := 'coach-activity-comment:' || actor_id::text || ':' ||
    coalesce(p_notification_id::text, p_workout_log_id::text, md5(p_wall_event_id)) || ':' || p_request_id::text;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'client_notifications' and column_name = 'recipient_role'
  ) then
    execute $insert$
      insert into public.client_notifications (
        user_id, recipient_role, kind, title, body, action_url, dedupe_key, push_suppressed_at
      ) values ($1, 'client', 'workout_comment', $2, $3, $4, $5, now())
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing returning id
    $insert$ into notice_id using recipient_id, notice_title, clean_body, notice_url, notice_key;
  else
    execute $insert$
      insert into public.client_notifications (
        user_id, kind, title, body, web_category, web_url, web_dedupe_key
      ) values ($1, 'workout_comment', $2, $3, 'workout_comment', $4, $5)
      on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing returning id
    $insert$ into notice_id using recipient_id, notice_title, clean_body, notice_url, notice_key;
  end if;

  -- Legacy insert triggers enqueue device pushes synchronously. Remove only
  -- this notification's jobs before commit, while no worker can see them.
  if notice_id is not null then
    if to_regclass('public.fwb_web_push_queue') is not null then
      execute 'delete from public.fwb_web_push_queue where notification_id = $1' using notice_id;
    end if;
    if to_regclass('public.fwb_native_push_queue') is not null then
      execute 'delete from public.fwb_native_push_queue where notification_id = $1' using notice_id;
    end if;
  end if;
  return true;
end;
$$;
revoke all on function coach_activity_private.send_coach_activity_comment(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function coach_activity_private.send_coach_activity_comment(uuid, uuid, text, uuid, text) to authenticated;

create function public.send_coach_activity_comment(
  p_notification_id uuid, p_workout_log_id uuid, p_body text, p_request_id uuid,
  p_wall_event_id text default null
) returns boolean
language sql security invoker set search_path = ''
as $$
  select coach_activity_private.send_coach_activity_comment(p_notification_id, p_workout_log_id, p_body, p_request_id, p_wall_event_id);
$$;
revoke all on function public.send_coach_activity_comment(uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.send_coach_activity_comment(uuid, uuid, text, uuid, text) to authenticated;
