-- Queue one coach alert per client-created exercise name, regardless of client platform.
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
      'nutrition_activity', 'client_inactive', 'client_login', 'custom_exercise', 'general'
    )
  );

create or replace function public.notify_coach_custom_exercises(p_names text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  signed_in_user_id uuid := auth.uid();
  signed_in_email text;
  program_id uuid;
  coach_id uuid;
  client_name text;
  supplied_name text;
  clean_name text;
  normalized_name text;
  queued_count integer := 0;
  today_count integer := 0;
begin
  if signed_in_user_id is null then
    raise exception 'Client sign-in required' using errcode = '42501';
  end if;
  if p_names is null or cardinality(p_names) > 12 then
    raise exception 'Invalid exercise selection' using errcode = '22023';
  end if;

  select lower(btrim(u.email)) into signed_in_email
    from auth.users as u
   where u.id = signed_in_user_id and u.deleted_at is null;
  if signed_in_email is null then
    raise exception 'Client account not found' using errcode = '42501';
  end if;

  select p.id, nullif(btrim(p.client_name), '') into program_id, client_name
    from public.client_programs as p
   where lower(btrim(p.client_email)) = signed_in_email
     and p.active is true and p.client_archived is not true
   order by p.updated_at desc, p.id
   limit 1;
  if program_id is null then
    raise exception 'Active client program required' using errcode = '42501';
  end if;

  select u.id into coach_id from auth.users as u
   where lower(btrim(u.email)) = 'benjaminbenz.fit@gmail.com'
     and u.deleted_at is null
   limit 1;
  if coach_id is null or coach_id = signed_in_user_id then
    return 0;
  end if;

  select count(*) into today_count
    from public.client_notifications as notice
   where notice.user_id = coach_id
     and notice.kind = 'custom_exercise'
     and notice.created_at >= date_trunc('day', now())
     and coalesce(to_jsonb(notice) ->> 'web_dedupe_key',
                  to_jsonb(notice) ->> 'dedupe_key', '')
           like 'coach-custom-exercise:' || signed_in_user_id::text || ':%';

  foreach supplied_name in array p_names loop
    exit when today_count >= 30;
    clean_name := btrim(regexp_replace(coalesce(supplied_name, ''), '\s+', ' ', 'g'));
    normalized_name := lower(clean_name);
    if char_length(clean_name) < 2 or char_length(clean_name) > 120
       or normalized_name ~ '^(exercise [0-9]+|[0-9]+(st|nd|rd|th) exercise|add exercise)$'
       or exists (
         select 1 from public.exercise_library as library
          where library.is_active is true and library.is_approved is true
            and (lower(btrim(library.name)) = normalized_name
              or exists (select 1 from unnest(library.aliases) as alias
                          where lower(btrim(alias)) = normalized_name))
       ) then
      continue;
    end if;

    -- Deployed projects have web_* fields; fresh projects use the versioned
    -- action_url/dedupe_key notification contract.
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'client_notifications'
         and column_name = 'web_dedupe_key'
    ) then
      insert into public.client_notifications
        (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
      values
        (coach_id, 'custom_exercise', 'Client added a custom exercise',
         left(coalesce(client_name, 'A client'), 100) || ' added “' || clean_name || '” as a custom exercise.',
         'custom_exercise', '/coach-admin.html?tab=library&client=' || program_id::text,
         'coach-custom-exercise:' || signed_in_user_id::text || ':' || md5(normalized_name))
      on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing;
    else
      perform private.fwb_queue_notification(
        'benjaminbenz.fit@gmail.com', 'coach', 'custom_exercise',
        'Client added a custom exercise',
        left(coalesce(client_name, 'A client'), 100) || ' added “' || clean_name || '” as a custom exercise.',
        '/coach-admin.html?tab=library&client=' || program_id::text,
        'coach-custom-exercise:' || signed_in_user_id::text || ':' || md5(normalized_name),
        jsonb_build_object('client_email', signed_in_email, 'client_program_id', program_id,
                           'exercise_name', clean_name)
      );
    end if;
    queued_count := queued_count + 1;
    today_count := today_count + 1;
  end loop;
  return queued_count;
end;
$$;

revoke all on function public.notify_coach_custom_exercises(text[]) from public, anon;
grant execute on function public.notify_coach_custom_exercises(text[]) to authenticated;
