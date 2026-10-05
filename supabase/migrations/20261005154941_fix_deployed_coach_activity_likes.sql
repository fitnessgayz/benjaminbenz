-- Keep coach activity reactions compatible with both notification schemas.
-- Production currently uses web_category/web_url/web_dedupe_key while fresh
-- environments use recipient_role/action_url/dedupe_key/metadata.

create index if not exists coach_activity_likes_source_notification_idx
  on public.coach_activity_likes (source_notification_id);

create or replace function private.fwb_activity_client_email(
  p_notice public.client_notifications
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  payload jsonb := to_jsonb(p_notice);
  category text := coalesce(nullif(payload ->> 'web_category', ''), payload ->> 'kind');
  resolved_email text := lower(btrim(coalesce(payload #>> '{metadata,client_email}', '')));
  source_key text := coalesce(payload ->> 'web_dedupe_key', payload ->> 'dedupe_key', '');
  source_url text := coalesce(payload ->> 'web_url', payload ->> 'action_url', '');
  program_id uuid;
  achievement_id uuid;
begin
  if resolved_email <> '' then
    return resolved_email;
  end if;

  if category = 'workout_completed' then
    return lower(btrim(coalesce(substring(source_key from '^workout:([^:]+):'), '')));
  end if;

  if category = 'check_in_submitted' then
    program_id := nullif(substring(source_url from '[?&]client=([0-9a-fA-F-]{36})'), '')::uuid;
    if program_id is not null then
      select lower(btrim(program.client_email))
        into resolved_email
        from public.client_programs as program
       where program.id = program_id
       limit 1;
    end if;
    return coalesce(resolved_email, '');
  end if;

  if category = 'achievement' then
    achievement_id := nullif(substring(source_key from '^coach-achievement:([0-9a-fA-F-]{36})$'), '')::uuid;
    if achievement_id is not null then
      select lower(btrim(event.client_email))
        into resolved_email
        from public.client_achievement_events as event
       where event.id = achievement_id
       limit 1;
    end if;
    return coalesce(resolved_email, '');
  end if;

  return '';
end;
$$;

revoke all on function private.fwb_activity_client_email(public.client_notifications)
  from public, anon, authenticated;

create or replace function public.coach_activity_feed()
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  action_url text,
  created_at timestamptz,
  read_at timestamptz,
  can_like boolean,
  liked boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not coalesce(public.is_coach_admin(), false) then
    raise exception 'Coach access required' using errcode = '42501';
  end if;

  return query
  select notice.id,
         source.category,
         notice.title,
         notice.body,
         coalesce(nullif(source.payload ->> 'web_url', ''), nullif(source.payload ->> 'action_url', ''), '/coach-admin.html?tab=notifications'),
         notice.created_at,
         notice.read_at,
         source.category in ('workout_completed', 'check_in_submitted', 'achievement')
           and target.client_email <> ''
           and exists (
             select 1 from auth.users as client_user
              where lower(client_user.email) = target.client_email
                and client_user.deleted_at is null
           ),
         exists (
           select 1 from public.coach_activity_likes as reaction
            where reaction.coach_user_id = actor_id
              and reaction.source_notification_id = notice.id
         )
    from public.client_notifications as notice
    cross join lateral (
      select to_jsonb(notice) as payload,
             coalesce(nullif(to_jsonb(notice) ->> 'web_category', ''), notice.kind) as category
    ) as source
    cross join lateral (
      select private.fwb_activity_client_email(notice) as client_email
    ) as target
   where notice.user_id = actor_id
     and coalesce(source.payload ->> 'recipient_role', 'coach') = 'coach'
   order by notice.created_at desc
   limit 12;
end;
$$;

revoke all on function public.coach_activity_feed() from public, anon;
grant execute on function public.coach_activity_feed() to authenticated;

create or replace function public.toggle_client_activity_like(p_notification_id uuid)
returns table (liked boolean, reaction_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  source_notice public.client_notifications%rowtype;
  source_payload jsonb;
  source_category text;
  source_key text;
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
     and notification.user_id = actor_id;

  if source_notice.id is null then
    raise exception 'Activity is unavailable' using errcode = '22023';
  end if;

  source_payload := to_jsonb(source_notice);
  if coalesce(source_payload ->> 'recipient_role', 'coach') <> 'coach' then
    raise exception 'Activity is unavailable' using errcode = '22023';
  end if;
  source_category := coalesce(nullif(source_payload ->> 'web_category', ''), source_notice.kind);
  if source_category not in ('workout_completed', 'check_in_submitted', 'achievement') then
    raise exception 'Activity is unavailable' using errcode = '22023';
  end if;

  target_email := private.fwb_activity_client_email(source_notice);
  select user_record.id into target_user_id
    from auth.users as user_record
   where lower(user_record.email) = target_email
     and user_record.deleted_at is null
   order by user_record.created_at
   limit 1;
  if target_email = '' or target_user_id is null then
    raise exception 'Client account is unavailable' using errcode = '22023';
  end if;

  source_key := coalesce(source_payload ->> 'web_dedupe_key', source_payload ->> 'dedupe_key', '');
  resolved_type := case source_category
    when 'workout_completed' then 'workout'
    when 'achievement' then 'badge'
    else case
      when source_key like 'coach-gym:%' then 'gym_checkin'
      when source_key like 'coach-weekly:%' then 'weekly_checkin'
      when lower(coalesce(source_payload #>> '{metadata,check_in_type}', '')) = 'gym' then 'gym_checkin'
      when lower(coalesce(source_payload #>> '{metadata,check_in_type}', '')) = 'weekly' then 'weekly_checkin'
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

  if source_payload ? 'recipient_role' then
    execute $insert$
      insert into public.client_notifications (
        user_id, recipient_role, kind, title, body, action_url, dedupe_key, metadata
      ) values ($1, 'client', 'coach_reaction', $2, $3, $4, $5, $6)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    $insert$ using target_user_id, reaction_title,
      'Nice work—your coach saw this and sent some encouragement.',
      client_url, 'coach-activity-like:' || reaction.id::text,
      jsonb_build_object(
        'activity_type', resolved_type,
        'source_notification_id', source_notice.id,
        'reaction_id', reaction.id
      );
  else
    execute $insert$
      insert into public.client_notifications (
        user_id, kind, title, body, web_category, web_url, web_dedupe_key
      ) values ($1, 'coach_reaction', $2, $3, 'coach_reaction', $4, $5)
      on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing
    $insert$ using target_user_id, reaction_title,
      'Nice work—your coach saw this and sent some encouragement.',
      client_url, 'coach-activity-like:' || reaction.id::text;
  end if;

  return query select true, reaction.id;
end;
$$;

revoke all on function public.toggle_client_activity_like(uuid) from public, anon;
grant execute on function public.toggle_client_activity_like(uuid) to authenticated;

-- Badge alerts previously called a queue helper that is absent from the
-- deployed notification backend. Write through the active schema instead.
create or replace function private.fwb_achievement_event_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  coach_id uuid;
  client_program_id uuid;
  client_label text;
  notification_url text;
  modern_schema boolean;
begin
  select user_record.id into coach_id
    from auth.users as user_record
   where lower(user_record.email) = 'benjaminbenz.fit@gmail.com'
     and user_record.deleted_at is null
   order by user_record.created_at
   limit 1;
  if coach_id is null then return new; end if;

  select program.id,
         nullif(btrim(regexp_replace(program.client_name, '\s+', ' ', 'g')), '')
    into client_program_id, client_label
    from public.client_programs as program
   where lower(btrim(program.client_email)) = new.client_email
   order by (program.client_archived is not true) desc,
            (program.active is not false) desc,
            program.updated_at desc nulls last,
            program.created_at desc nulls last,
            program.id
   limit 1;

  client_label := left(coalesce(client_label, nullif(split_part(new.client_email, '@', 1), ''), 'Client'), 100);
  notification_url := '/coach-admin.html?tab=notifications'
    || case when client_program_id is null then '' else '&client=' || client_program_id::text end;
  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'client_notifications'
       and column_name = 'recipient_role'
  ) into modern_schema;

  if modern_schema then
    execute $insert$
      insert into public.client_notifications (
        user_id, recipient_role, kind, title, body, action_url, dedupe_key, metadata
      ) values ($1, 'coach', 'achievement', $2, $3, $4, $5, $6)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    $insert$ using coach_id,
      left(client_label || ' earned ' || new.badge_title, 160),
      'Open FWB Coach to celebrate this new badge.',
      notification_url,
      'coach-achievement:' || new.id::text,
      jsonb_build_object(
        'client_email', new.client_email,
        'activity_type', 'badge',
        'achievement_event_id', new.id,
        'badge_id', new.badge_id,
        'badge_title', new.badge_title,
        'earned_on', new.earned_on
      );
  else
    execute $insert$
      insert into public.client_notifications (
        user_id, kind, title, body, web_category, web_url, web_dedupe_key
      ) values ($1, 'achievement', $2, $3, 'achievement', $4, $5)
      on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing
    $insert$ using coach_id,
      left(client_label || ' earned ' || new.badge_title, 160),
      'Open FWB Coach to celebrate this new badge.',
      notification_url,
      'coach-achievement:' || new.id::text;
  end if;
  return new;
end;
$$;

revoke all on function private.fwb_achievement_event_notification()
  from public, anon, authenticated;
