-- Rollback-only integration check: no client records or notifications are retained.
begin;
create temp table mood_notification_test (like public.client_progress including defaults);
create trigger test_mood_notification after insert or update of mood_checkin_submitted_at
on mood_notification_test for each row execute function fwb_private.mood_checkin_notification();

do $$
<<mood_test>>
declare
  client_id uuid;
  client_email text;
  client_label text;
  progress_id uuid := gen_random_uuid();
  dedupe text;
  actual_count integer;
  push_count integer;
  expected_devices integer;
begin
  select u.id, u.email into client_id, client_email
    from auth.users u join public.client_programs p on lower(p.client_email) = lower(u.email)
   where lower(u.email) <> 'benjaminbenz.fit@gmail.com' and u.deleted_at is null
   limit 1;
  assert client_id is not null, 'Need one existing client identity for rollback test';
  select left(coalesce(nullif(btrim(regexp_replace(p.client_name, '\s+', ' ', 'g')), ''),
                       nullif(split_part(lower(btrim(mood_test.client_email)), '@', 1), ''), 'Client'), 100)
    into client_label from public.client_programs p
   where lower(btrim(p.client_email)) = lower(btrim(mood_test.client_email))
   order by (p.client_archived is not true) desc, (p.active is not false) desc,
            p.updated_at desc nulls last, p.created_at desc nulls last, p.id limit 1;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', client_id, 'email', client_email, 'role', 'authenticated')::text, true);
  dedupe := 'coach-mood:' || md5(lower(btrim(client_email))) || ':2099-12-29';
  assert not exists(select 1 from public.client_notifications where web_dedupe_key = dedupe), 'Test date must be unused';

  insert into mood_notification_test(id,client_email,entry_date,bodyweight)
  values (progress_id,client_email,'2099-12-29',150);
  assert not exists(select 1 from public.client_notifications where web_dedupe_key = dedupe), 'Measurements must not send mood notifications';

  update mood_notification_test set goal_note='Mood: 4/5 · Energy: 3/5', mood_checkin_submitted_at=clock_timestamp() where id=progress_id;
  select count(*) into actual_count from public.client_notifications n where n.web_dedupe_key=dedupe
    and n.title=client_label || ' completed a mood check-in' and n.web_category='check_in_submitted'
    and n.web_url like '/coach-admin.html?tab=progress&client=%'
    and n.body not like '%4/5%';
  assert actual_count=1, 'Completion must create one private coach alert with a client link';
  select count(*) into push_count from public.fwb_web_push_queue q join public.client_notifications n on n.id=q.notification_id where n.web_dedupe_key=dedupe;
  select count(*) into expected_devices from public.fwb_web_push_subscriptions d
    join public.fwb_notification_settings s on s.user_id=d.user_id
    join auth.users u on u.id=d.user_id
    where lower(u.email)='benjaminbenz.fit@gmail.com' and s.push_enabled and coalesce((s.categories->>'check_in_submitted')::boolean,true);
  assert push_count=expected_devices, 'Push must queue for each enabled coach device';

  update mood_notification_test set mood_checkin_submitted_at=clock_timestamp() where id=progress_id;
  update mood_notification_test set bodyweight=151 where id=progress_id;
  select count(*) into actual_count from public.client_notifications where web_dedupe_key=dedupe;
  assert actual_count=1, 'Retries and measurement edits must not duplicate the alert';

  insert into mood_notification_test(client_email,entry_date,goal_note,mood_checkin_submitted_at)
  values (client_email,'2099-12-30','Note: Feeling good',clock_timestamp());
  assert exists(select 1 from public.client_notifications where web_dedupe_key=replace(dedupe,'2099-12-29','2099-12-30')), 'Next day must notify again';

  begin
    insert into mood_notification_test(client_email,entry_date,goal_note,mood_checkin_submitted_at)
    values (client_email,'2099-12-31','Mood: 3/5',clock_timestamp());
    raise exception 'simulate failed save';
  exception when raise_exception then null;
  end;
  assert not exists(select 1 from public.client_notifications where web_dedupe_key=replace(dedupe,'2099-12-29','2099-12-31')), 'Failed save must roll back notification';

  perform set_config('request.jwt.claims', jsonb_build_object('sub',client_id,'email','different@example.invalid')::text,true);
  insert into mood_notification_test(client_email,entry_date,goal_note,mood_checkin_submitted_at)
  values (client_email,'2099-12-31','Mood: 3/5',clock_timestamp());
  assert not exists(select 1 from public.client_notifications where web_dedupe_key=replace(dedupe,'2099-12-29','2099-12-31')), 'Different actor must not notify';
end;
$$;
rollback;
