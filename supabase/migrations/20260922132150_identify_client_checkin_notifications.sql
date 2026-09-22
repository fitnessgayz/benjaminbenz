-- Identify the client in the inbox and phone alert without copying private answers.
-- Keep support for both notification schemas used by this app.
create or replace function fwb_private.queue_client_checkin(
  p_client_email text,
  p_checkin_type text,
  p_dedupe_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_client_email text := lower(btrim(p_client_email));
  actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  coach_id uuid;
  client_program_id uuid;
  client_label text;
  notification_title text;
  notification_body text;
  notification_url text;
begin
  if auth.uid() is null or normalized_client_email is null or normalized_client_email = ''
     or actor_email <> normalized_client_email then
    return;
  end if;
  if p_checkin_type is null or p_checkin_type not in ('gym', 'mood', 'weekly') then
    return;
  end if;

  select u.id into coach_id from auth.users u
   where lower(u.email) = 'benjaminbenz.fit@gmail.com' and u.deleted_at is null
   order by u.created_at limit 1;
  if coach_id is null then return; end if;

  select p.id, nullif(btrim(regexp_replace(p.client_name, '\s+', ' ', 'g')), '')
    into client_program_id, client_label
    from public.client_programs p
   where lower(btrim(p.client_email)) = normalized_client_email
   order by (p.client_archived is not true) desc, (p.active is not false) desc,
            p.updated_at desc nulls last, p.created_at desc nulls last, p.id
   limit 1;
  client_label := left(coalesce(client_label, nullif(split_part(normalized_client_email, '@', 1), ''), 'Client'), 100);
  notification_title := client_label || case p_checkin_type
    when 'gym' then ' checked in at the gym'
    when 'mood' then ' completed a mood check-in'
    else ' submitted a weekly check-in' end;
  notification_body := case p_checkin_type
    when 'gym' then 'Open Coach Admin to view their activity.'
    else 'Open Coach Admin to review the private check-in.' end;
  notification_url := '/coach-admin.html?tab=' || case p_checkin_type when 'gym' then 'home' else 'progress' end;
  if client_program_id is not null then
    notification_url := notification_url || '&client=' || client_program_id::text;
  end if;

  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'client_notifications' and column_name = 'recipient_role') then
    perform private.fwb_queue_notification(
      'benjaminbenz.fit@gmail.com', 'coach', 'check_in_submitted',
      notification_title, notification_body, notification_url, p_dedupe_key,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('client_email', normalized_client_email, 'check_in_type', p_checkin_type)
    );
  else
    -- Preserve the deployed weekly producer's inbox preference behavior.
    -- Mood/gym inbox entries still exist when browser delivery is turned off.
    if p_checkin_type = 'weekly' and not exists (
      select 1 from public.fwb_notification_settings s
       where s.user_id = coach_id and coalesce((s.categories ->> 'check_in_submitted')::boolean, true)
    ) then
      return;
    end if;
    insert into public.client_notifications
      (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
    values
      (coach_id, 'general', notification_title, notification_body,
       'check_in_submitted', notification_url, p_dedupe_key)
    on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing;
  end if;
end;
$$;
revoke all on function fwb_private.queue_client_checkin(text, text, text, jsonb) from public, anon, authenticated;

create or replace function fwb_private.mood_checkin_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mood_checkin_submitted_at is null or btrim(coalesce(new.goal_note, '')) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.mood_checkin_submitted_at is not distinct from new.mood_checkin_submitted_at then
    return new;
  end if;
  perform fwb_private.queue_client_checkin(
    new.client_email, 'mood',
    'coach-mood:' || md5(lower(btrim(new.client_email))) || ':' || new.entry_date::text,
    jsonb_build_object('progress_id', new.id)
  );
  return new;
end;
$$;
revoke all on function fwb_private.mood_checkin_notification() from public, anon, authenticated;

create or replace function fwb_private.gym_checkin_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform fwb_private.queue_client_checkin(
    new.client_email, 'gym',
    'coach-gym:' || md5(lower(btrim(new.client_email))) || ':' || new.entry_date::text
  );
  return new;
end;
$$;
revoke all on function fwb_private.gym_checkin_notification() from public, anon, authenticated;

drop trigger if exists fwb_gym_checkin_notifications on public.client_gym_checkins;
create trigger fwb_gym_checkin_notifications
after insert on public.client_gym_checkins
for each row execute function fwb_private.gym_checkin_notification();

-- Update whichever weekly-check-in trigger is installed. Preserve reply handling
-- and the existing dedupe keys so deployment cannot replay past check-ins.
do $migration$
begin
  if to_regprocedure('fwb_private.notify_checkin()') is not null then
    execute $definition$
      create or replace function fwb_private.notify_checkin()
      returns trigger language plpgsql security definer set search_path = '' as $function$
      begin
        if tg_op = 'INSERT' or (new.weekly_submitted_at is distinct from old.weekly_submitted_at and new.weekly_submitted_at is not null) then
          perform fwb_private.queue_client_checkin(
            new.client_email, 'weekly',
            'checkin:' || new.id::text || ':' || coalesce(new.weekly_submitted_at::text, 'initial'),
            jsonb_build_object('check_in_id', new.id)
          );
        end if;
        if tg_op = 'UPDATE' and new.coach_response is distinct from old.coach_response and coalesce(new.coach_response, '') <> '' then
          perform fwb_private.emit(new.client_email, 'coach_reply', 'Your coach replied',
            'There is a new response to your check-in.',
            'checkin-reply:' || new.id::text || ':' || md5(new.coach_response));
        end if;
        return new;
      end;
      $function$;
    $definition$;
    revoke all on function fwb_private.notify_checkin() from public, anon, authenticated;
  end if;

  if to_regprocedure('private.fwb_check_in_notification_trigger()') is not null then
    execute $definition$
      create or replace function private.fwb_check_in_notification_trigger()
      returns trigger language plpgsql security definer set search_path = '' as $function$
      declare
        actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
      begin
        if tg_op = 'INSERT' or (new.weekly_submitted_at is not null and old.weekly_submitted_at is distinct from new.weekly_submitted_at) then
          perform fwb_private.queue_client_checkin(
            new.client_email, 'weekly', 'coach-check-in:' || new.id::text,
            jsonb_build_object('check_in_id', new.id)
          );
        end if;
        if actor_email = 'benjaminbenz.fit@gmail.com'
           and new.coach_response is not null and btrim(new.coach_response) <> ''
           and (tg_op = 'INSERT' or old.coach_response is distinct from new.coach_response) then
          perform private.fwb_queue_notification(
            new.client_email, 'client', 'coach_reply', 'Your coach replied to your check-in',
            'Open FWB to read the private response.', '/client-dashboard.html?tab=progress',
            'client-check-in-reply:' || new.id::text || ':' || floor(extract(epoch from coalesce(new.coach_responded_at, new.updated_at)))::bigint::text,
            jsonb_build_object('check_in_id', new.id)
          );
        end if;
        return new;
      end;
      $function$;
    $definition$;
    revoke all on function private.fwb_check_in_notification_trigger() from public, anon, authenticated;
  end if;
end;
$migration$;
