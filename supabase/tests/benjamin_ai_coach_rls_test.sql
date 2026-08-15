begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

select has_table('public', 'client_progress_notes', 'progress notes table exists');
select has_table('public', 'client_check_ins', 'check-ins table exists');
select has_table('public', 'coach_requests', 'coach requests table exists');
select has_column('public', 'client_workout_logs', 'workout_session_id', 'workout session IDs are available');
select has_column('public', 'client_workout_logs', 'source', 'workout log sources are available');
select is(
  (select relrowsecurity from pg_class where oid = 'public.client_check_ins'::regclass),
  true,
  'check-ins have RLS enabled'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"alex.client@example.test","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.client_programs),
  1,
  'a client sees only their own active program'
);
select is(
  (select count(*)::integer from public.client_progress),
  1,
  'a client sees only their own body progress'
);
select is(
  (select count(*)::integer from public.client_workout_logs),
  1,
  'a client sees only their own workout logs'
);

select lives_ok(
  $$insert into public.client_workout_logs (
      client_email, entry_date, workout_title, exercise_code, exercise_name,
      set_number, weight_used, reps, workout_session_id, source
    ) values (
      'alex.client@example.test', current_date, 'MCP Bodyweight Test', 'A', 'Push-up',
      1, null, 12, '50000000-0000-4000-8000-000000000005', 'mcp'
    )$$,
  'a client can save their own MCP bodyweight workout set'
);
select throws_ok(
  $$insert into public.client_workout_logs (
      client_email, entry_date, workout_title, exercise_code, exercise_name,
      set_number, weight_used, reps, workout_session_id, source
    ) values (
      'riley.client@example.test', current_date, 'MCP Other Client Test', 'A', 'Push-up',
      1, null, 12, '60000000-0000-4000-8000-000000000006', 'mcp'
    )$$,
  '42501',
  null,
  'a client cannot save a workout for another client'
);
select lives_ok(
  $$delete from public.client_workout_logs
    where workout_session_id = '50000000-0000-4000-8000-000000000005'$$,
  'a client can undo their own MCP workout'
);

select lives_ok(
  $$insert into public.client_check_ins (client_email, energy, source)
    values ('alex.client@example.test', 4, 'chatgpt_plugin')$$,
  'a client can create their own ChatGPT check-in'
);
select throws_ok(
  $$insert into public.client_check_ins (client_email, energy, source)
    values ('riley.client@example.test', 4, 'chatgpt_plugin')$$,
  '42501',
  null,
  'a client cannot create another client check-in'
);
select throws_ok(
  $$insert into public.client_progress_notes (client_email, category, note, source)
    values ('alex.client@example.test', 'general', 'Not from ChatGPT', 'coach')$$,
  '42501',
  null,
  'a client cannot spoof a coach-authored progress note'
);
select lives_ok(
  $$insert into public.coach_requests (client_email, request_type, message, source)
    values ('alex.client@example.test', 'program_review', 'Please review my plan', 'chatgpt_plugin')$$,
  'a client can create their own coach request'
);
select is(
  (select count(*)::integer from public.coach_requests),
  1,
  'a client sees their own coach request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"riley.client@example.test","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.coach_requests),
  0,
  'another client cannot see the request'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"benjaminbenz.fit@gmail.com","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.coach_requests),
  1,
  'Benjamin can see client coach requests'
);
select lives_ok(
  $$update public.coach_requests set status = 'in_review' where client_email = 'alex.client@example.test'$$,
  'Benjamin can update a coach request'
);

select * from finish();
rollback;
