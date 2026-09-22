-- Rollback-only integration test. Source rows are temporary; notifications and
-- push jobs created by their real triggers are rolled back with this transaction.
-- The legacy weekly-preference fixture is also restored by the final rollback.
begin;
set local timezone = 'UTC';

create temp table checkin_notification_identity as
select u.id as client_id, lower(btrim(u.email)) as client_email,
       p.id as program_id,
       left(btrim(regexp_replace(p.client_name, '\s+', ' ', 'g')), 100) as client_label,
       (select c.id from auth.users c
         where lower(c.email) = 'benjaminbenz.fit@gmail.com' and c.deleted_at is null
         order by c.created_at limit 1) as coach_id
from auth.users u
cross join lateral (
  select cp.id, cp.client_name from public.client_programs cp
   where lower(btrim(cp.client_email)) = lower(btrim(u.email))
   order by (cp.client_archived is not true) desc, (cp.active is not false) desc,
            cp.updated_at desc nulls last, cp.created_at desc nulls last, cp.id
   limit 1
) p
where lower(u.email) <> 'benjaminbenz.fit@gmail.com' and u.deleted_at is null
  and nullif(btrim(p.client_name), '') is not null
limit 1;

-- The application supports both the deployed web_* and versioned schemas.
create temp view checkin_test_notifications as
select n.id, n.user_id, n.title, n.body,
       coalesce(to_jsonb(n)->>'web_category', to_jsonb(n)->>'kind') as category,
       coalesce(to_jsonb(n)->>'web_url', to_jsonb(n)->>'action_url') as action_url,
       coalesce(to_jsonb(n)->>'web_dedupe_key', to_jsonb(n)->>'dedupe_key') as dedupe_key
from public.client_notifications n;

create temp table checkin_test_mood (
  id uuid primary key default gen_random_uuid(), client_email text,
  entry_date date, bodyweight numeric, goal_note text,
  mood_checkin_submitted_at timestamptz
);
create trigger test_client_mood_notification
after insert or update of mood_checkin_submitted_at on checkin_test_mood
for each row execute function fwb_private.mood_checkin_notification();

create temp table checkin_test_gym (
  client_email text, entry_date date, primary key (client_email, entry_date)
);
create trigger test_client_gym_notification after insert on checkin_test_gym
for each row execute function fwb_private.gym_checkin_notification();

create temp table checkin_test_weekly (
  id uuid primary key default gen_random_uuid(), client_email text,
  weekly_submitted_at timestamptz, note text, coach_response text,
  coach_responded_at timestamptz, updated_at timestamptz default now()
);
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'client_notifications'
                and column_name = 'recipient_role') then
    execute 'create trigger test_client_weekly_notification after insert or update on checkin_test_weekly
      for each row execute function private.fwb_check_in_notification_trigger()';
  else
    execute 'create trigger test_client_weekly_notification after insert or update on checkin_test_weekly
      for each row execute function fwb_private.notify_checkin()';
  end if;
end;
$$;

create function pg_temp.assert_client_checkin(p_key text, p_suffix text, p_tab text)
returns void language plpgsql as $$
declare
  identity_row record;
  notification_row record;
  actual_count integer;
  queued_count integer;
  expected_devices integer;
begin
  select * into strict identity_row from checkin_notification_identity;
  select count(*) into actual_count from checkin_test_notifications where dedupe_key = p_key;
  assert actual_count = 1, 'One notification per dedupe key is required';
  select * into strict notification_row from checkin_test_notifications where dedupe_key = p_key;
  assert notification_row.user_id = identity_row.coach_id, 'Only the coach receives the check-in alert';
  assert notification_row.title = identity_row.client_label || p_suffix, 'Title must identify the selected client';
  assert notification_row.category = 'check_in_submitted', 'Existing check-in notification preference must apply';
  assert notification_row.action_url = '/coach-admin.html?tab=' || p_tab || '&client=' || identity_row.program_id::text,
    'Notification must open the matching client and section';
  assert notification_row.body = case when p_tab = 'home'
      then 'Open Coach Admin to view their activity.'
      else 'Open Coach Admin to review the private check-in.' end,
    'Body must not disclose mood ratings or private notes';

  if to_regclass('public.fwb_web_push_queue') is not null then
    select count(*) into queued_count from public.fwb_web_push_queue q
     where q.notification_id = notification_row.id;
    select count(*) into expected_devices
      from public.fwb_web_push_subscriptions d
      join public.fwb_notification_settings s on s.user_id = d.user_id
     where d.user_id = identity_row.coach_id and s.push_enabled
       and coalesce((s.categories->>'check_in_submitted')::boolean, true);
    assert queued_count = expected_devices, 'Queue exactly the coach devices allowed by existing preferences';
  end if;
end;
$$;

do $$
declare
  identity_row record;
  progress_id uuid := gen_random_uuid();
  weekly_id uuid := gen_random_uuid();
  submitted_at timestamptz := '2099-12-27 18:00:00+00';
  gym_key text;
  mood_key text;
  weekly_key text;
  denied_key text := 'checkin-test-denied:' || gen_random_uuid()::text;
  is_versioned boolean;
begin
  select * into identity_row from checkin_notification_identity;
  assert identity_row.client_id is not null and identity_row.coach_id is not null,
    'Need an existing named client and coach for the rollback test';
  assert not has_function_privilege('authenticated',
    'fwb_private.queue_client_checkin(text,text,text,jsonb)', 'EXECUTE'),
    'Clients cannot invoke the internal notification queue directly';

  gym_key := 'coach-gym:' || md5(identity_row.client_email) || ':2099-12-25';
  mood_key := 'coach-mood:' || md5(identity_row.client_email) || ':2099-12-26';
  assert not exists (select 1 from checkin_test_notifications where dedupe_key in (gym_key, mood_key)),
    'Rollback test dates must be unused';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', identity_row.client_id,
    'email', identity_row.client_email, 'role', 'authenticated')::text, true);

  insert into checkin_test_gym values (identity_row.client_email, '2099-12-25');
  insert into checkin_test_gym values (identity_row.client_email, '2099-12-25') on conflict do nothing;
  perform pg_temp.assert_client_checkin(gym_key, ' checked in at the gym', 'home');

  insert into checkin_test_mood(id, client_email, entry_date, bodyweight)
  values (progress_id, identity_row.client_email, '2099-12-26', 150);
  update checkin_test_mood set mood_checkin_submitted_at = clock_timestamp(), goal_note = '' where id = progress_id;
  assert not exists (select 1 from checkin_test_notifications where dedupe_key = mood_key),
    'Measurements and an empty mood check-in must not notify';
  update checkin_test_mood set goal_note = 'Mood: 2/5; private health detail',
    mood_checkin_submitted_at = clock_timestamp() where id = progress_id;
  perform pg_temp.assert_client_checkin(mood_key, ' completed a mood check-in', 'progress');
  update checkin_test_mood set mood_checkin_submitted_at = clock_timestamp() where id = progress_id;
  update checkin_test_mood set bodyweight = 151 where id = progress_id;
  perform pg_temp.assert_client_checkin(mood_key, ' completed a mood check-in', 'progress');

  select exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'client_notifications' and column_name = 'recipient_role') into is_versioned;
  if not is_versioned then
    insert into public.fwb_notification_settings(user_id, push_enabled, categories)
    values (identity_row.coach_id, false, '{"check_in_submitted":false}')
    on conflict (user_id) do update set categories = jsonb_set(
      coalesce(public.fwb_notification_settings.categories, '{}'::jsonb),
      '{check_in_submitted}', 'false'::jsonb, true);
    perform fwb_private.queue_client_checkin(identity_row.client_email, 'weekly', denied_key || ':disabled');
    assert not exists (select 1 from checkin_test_notifications where dedupe_key = denied_key || ':disabled'),
      'Legacy weekly check-ins must respect the existing disabled-category preference';
    update public.fwb_notification_settings set categories = jsonb_set(
      coalesce(categories, '{}'::jsonb), '{check_in_submitted}', 'true'::jsonb, true)
    where user_id = identity_row.coach_id;
  end if;
  weekly_key := case when is_versioned then 'coach-check-in:' || weekly_id::text
    else 'checkin:' || weekly_id::text || ':' || submitted_at::text end;
  insert into checkin_test_weekly(id, client_email, weekly_submitted_at, note)
  values (weekly_id, identity_row.client_email, submitted_at, 'Private weekly health detail');
  update checkin_test_weekly set weekly_submitted_at = submitted_at where id = weekly_id;
  update checkin_test_weekly set note = 'Another private detail' where id = weekly_id;
  perform pg_temp.assert_client_checkin(weekly_key, ' submitted a weekly check-in', 'progress');

  -- Actor checks also apply when an internal caller supplies a different row email.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', identity_row.client_id,
    'email', 'different@example.invalid', 'role', 'authenticated')::text, true);
  perform fwb_private.queue_client_checkin(identity_row.client_email, 'gym', denied_key);
  perform set_config('request.jwt.claims', jsonb_build_object('email', identity_row.client_email)::text, true);
  perform fwb_private.queue_client_checkin(identity_row.client_email, 'mood', denied_key);
  assert not exists (select 1 from checkin_test_notifications where dedupe_key = denied_key),
    'A mismatched email or missing authenticated user must not notify';

  perform set_config('request.jwt.claims', jsonb_build_object('sub', identity_row.client_id,
    'email', identity_row.client_email, 'role', 'authenticated')::text, true);
  begin
    perform fwb_private.queue_client_checkin(identity_row.client_email, 'weekly', denied_key);
    raise exception 'Simulate failed client save';
  exception when raise_exception then null;
  end;
  assert not exists (select 1 from checkin_test_notifications where dedupe_key = denied_key),
    'A failed save must roll back the notification and its queued push';
end;
$$;
rollback;
