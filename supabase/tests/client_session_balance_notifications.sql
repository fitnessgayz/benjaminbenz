-- Rollback-only integration check. Uses synthetic identities and a temporary
-- program table with the actual production trigger functions. Nothing persists,
-- and the synthetic identities have no push subscriptions or email delivery.
begin;
create temp table session_balance_test_programs (like public.client_programs including defaults);

do $setup$
declare producer regproc;
begin
  select tgfoid::regproc into producer from pg_trigger
   where tgrelid = 'public.client_programs'::regclass and tgname = 'fwb_program_notifications';
  assert producer is not null, 'Existing program producer must remain installed';
  execute format('create trigger existing_program_notifications after insert or update on session_balance_test_programs for each row execute function %s()', producer);
  create trigger client_balance_notifications after insert or update on session_balance_test_programs
    for each row execute function fwb_private.notify_client_session_balance();
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='client_notifications' and column_name='action_url') then
    execute 'create temp view session_balance_test_inbox as select user_id,kind,title,body,dedupe_key as event_key,action_url as action from public.client_notifications';
  else
    execute 'create temp view session_balance_test_inbox as select user_id,kind,title,body,web_dedupe_key as event_key,web_url as action from public.client_notifications';
  end if;
end;
$setup$;

do $test$
declare
  recipient uuid := gen_random_uuid();
  existing_low_recipient uuid := gen_random_uuid();
  email text := 'session-balance-test-' || recipient::text || '@example.invalid';
  existing_email text := 'session-balance-test-' || existing_low_recipient::text || '@example.invalid';
  first_program uuid := gen_random_uuid();
  second_program uuid := gen_random_uuid();
  baseline_program uuid := gen_random_uuid();
  expected_count integer;
  program_events integer;
  note_events integer;
begin
  insert into auth.users (id,email,created_at,updated_at) values
    (recipient,email,now(),now()), (existing_low_recipient,existing_email,now(),now());

  insert into session_balance_test_programs
    (id,client_email,client_name,program_title,workouts,active,client_archived,session_count_used,session_count_total,session_package_history)
  values (first_program,email,'Session balance test','Test plan','[]',true,false,5,10,'[]');
  assert not exists(select 1 from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%'), 'Healthy package must not alert';

  -- No preferences row: website notices still use enabled defaults.
  update session_balance_test_programs set session_count_used=7 where id=first_program;
  assert not exists(select 1 from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%'), 'Three sessions remaining must not alert';
  update session_balance_test_programs set session_count_used=8 where id=first_program;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=1, 'Entering two remaining must produce one low notice without settings';
  assert exists(select 1 from session_balance_test_inbox where user_id=recipient and title='2 coaching sessions remaining' and action='/client-dashboard.html?tab=sessions'), 'Low notice must link to Sessions';

  insert into session_balance_test_programs
    (id,client_email,client_name,program_title,workouts,active,client_archived,session_count_used,session_count_total,session_package_history)
  values (second_program,email,'Session balance test','Alternate plan','[]',true,false,8,10,'[]');
  update session_balance_test_programs set program_title='Edited plan' where client_email=email;
  update session_balance_test_programs set session_count_used=8 where client_email=email;
  update session_balance_test_programs set session_count_used=9 where client_email=email;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=1, 'Fanout, unrelated edits, and two-to-one must not repeat low notices';

  update session_balance_test_programs set session_count_used=6 where client_email=email;
  update session_balance_test_programs set session_count_used=8 where client_email=email;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=1, 'Correcting the count above the low threshold must not renew the same package';

  update session_balance_test_programs set session_count_used=10 where client_email=email;
  update session_balance_test_programs set session_count_used=11 where client_email=email;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=2, 'Reaching zero must add exactly one distinct out notice';
  assert exists(select 1 from session_balance_test_inbox where user_id=recipient and title='You’re out of coaching sessions' and action='/client-dashboard.html?tab=sessions'), 'Out notice must be distinct and link to Sessions';

  update session_balance_test_programs set session_count_used=6 where client_email=email;
  update session_balance_test_programs set session_count_used=8 where client_email=email;
  update session_balance_test_programs set session_count_used=10 where client_email=email;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=2, 'Count corrections must not repeat either notice within the same package';

  update session_balance_test_programs set session_count_used=0,session_package_history='[{"used":10,"total":10}]' where client_email=email;
  update session_balance_test_programs set session_count_used=8 where client_email=email;
  update session_balance_test_programs set session_count_used=10 where client_email=email;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=4, 'A renewed package can notify low and out again';

  update session_balance_test_programs set session_count_total=3,session_count_used=0,
    session_package_history='[{"used":10,"total":10},{"used":10,"total":10}]' where client_email=email;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=4, 'A renewed three-session package stays quiet until two remain';
  update session_balance_test_programs set session_count_used=1 where client_email=email;
  update session_balance_test_programs set session_count_used=2 where client_email=email;
  update session_balance_test_programs set session_count_used=3 where client_email=email;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=6, 'Small renewed packages still get one low and one out notice';

  -- Explicit opt-out suppresses new inbox notices without modifying settings.
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='client_notifications' and column_name='action_url') then
    execute 'insert into public.client_notification_preferences(user_id,session_balance) values ($1,false) on conflict(user_id) do update set session_balance=false' using recipient;
  else
    execute 'insert into public.fwb_notification_settings(user_id,categories) values ($1,''{"low_sessions":false}'') on conflict(user_id) do update set categories=excluded.categories' using recipient;
  end if;
  update session_balance_test_programs set session_count_total=10,session_count_used=0,
    session_package_history='[{"used":3,"total":3}]' where client_email=email;
  update session_balance_test_programs set session_count_used=8 where client_email=email;
  update session_balance_test_programs set session_count_used=10 where client_email=email;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=6, 'Session balance opt-out must suppress both states';

  -- Preserve unrelated producer behavior, including program changes and notes.
  if exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='client_notifications' and column_name='action_url') then
    execute 'update public.client_notification_preferences set session_balance=true where user_id=$1' using recipient;
  else
    execute 'update public.fwb_notification_settings set categories=''{}'' where user_id=$1' using recipient;
  end if;
  select count(*) into program_events from session_balance_test_inbox where user_id=recipient and kind='program_update';
  select count(*) into note_events from session_balance_test_inbox where user_id=recipient and kind='coach_reply';
  update session_balance_test_programs set program_title='New training plan',updated_at=clock_timestamp() + interval '2 seconds' where id=first_program;
  update session_balance_test_programs set coach_note_body='A private coaching note',updated_at=clock_timestamp() where id=first_program;
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and kind='program_update')>program_events, 'Program notifications must remain intact';
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and kind='coach_reply')>note_events, 'Coach note notifications must remain intact';

  select count(*) into expected_count from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%';
  insert into session_balance_test_programs
    (client_email,client_name,program_title,workouts,active,client_archived,session_count_used,session_count_total,session_package_history)
  values
    (email,'Test','Inactive','[]',false,false,9,10,'[]'),
    (email,'Test','Archived','[]',true,true,9,10,'[]'),
    (email,'Test','Unset','[]',true,false,10,0,'[]'),
    ('no-login@example.invalid','Test','No account','[]',true,false,9,10,'[]');
  assert (select count(*) from session_balance_test_inbox where user_id=recipient and event_key like 'client-session-balance:v2:%')=expected_count, 'Inactive, archived, unset and absent-login records must not create client notices';

  -- Existing low balances are not backfilled by unrelated updates or 2 -> 1.
  alter table session_balance_test_programs disable trigger user;
  insert into session_balance_test_programs
    (id,client_email,client_name,program_title,workouts,active,client_archived,session_count_used,session_count_total,session_package_history)
  values (baseline_program,existing_email,'Existing low','Old plan','[]',true,false,8,10,'[]');
  alter table session_balance_test_programs enable trigger user;
  update session_balance_test_programs set program_title='Unrelated edit' where id=baseline_program;
  update session_balance_test_programs set session_count_used=9 where id=baseline_program;
  assert not exists(select 1 from session_balance_test_inbox where user_id=existing_low_recipient and event_key like 'client-session-balance:v2:%'), 'Deployment must not backfill low notices';
  update session_balance_test_programs set session_count_used=10 where id=baseline_program;
  assert (select count(*) from session_balance_test_inbox where user_id=existing_low_recipient and event_key like 'client-session-balance:v2:%')=1, 'An existing low package must still notify when it runs out';

  assert not has_table_privilege('authenticated','fwb_private.client_session_balance_state','select'), 'Client state must remain private';
  assert not has_function_privilege('authenticated','fwb_private.notify_client_session_balance()','execute'), 'Clients cannot invoke the trigger helper';
end;
$test$;
rollback;
