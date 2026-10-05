-- Keep the stored reaction model stable while using the friendlier "props"
-- language in every client-facing notification.
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
    when 'workout' then 'Benjamin gave you props for your workout'
    when 'weekly_checkin' then 'Benjamin gave you props for your weekly check-in'
    when 'daily_checkin' then 'Benjamin gave you props for your daily check-in'
    when 'gym_checkin' then 'Benjamin gave you props for your gym check-in'
    else 'Benjamin gave you props for your new badge'
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
