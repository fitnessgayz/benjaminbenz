-- Synthetic records only; the transaction always rolls back.
begin;
select set_config('fwb.test.weight_log', gen_random_uuid()::text, true);
insert into public.client_workout_logs
  (id,client_email,entry_date,workout_title,exercise_code,exercise_name,set_number,weight_used,reps,notes,set_type)
values
  (current_setting('fwb.test.weight_log')::uuid,'fwb-weight-correction-test@example.invalid','2026-10-02','Correction test','A1','Bench press',1,600,8,'Preserve these notes','working');
select set_config('fwb.test.weight_revision', updated_at::text,true)
from public.client_workout_logs where id=current_setting('fwb.test.weight_log')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","email":"benjaminbenz.fit@gmail.com","role":"authenticated"}', true);
do $$
declare
  id_key uuid := current_setting('fwb.test.weight_log')::uuid;
  revision timestamptz := current_setting('fwb.test.weight_revision')::timestamptz;
  saved public.client_workout_logs%rowtype;
begin
  -- Wrong client scope cannot change another record.
  begin
    perform public.coach_correct_workout_weight(id_key,'different@example.invalid',60,revision);
    raise exception 'Wrong client correction unexpectedly succeeded';
  exception when serialization_failure then null; end;
  begin
    perform public.coach_correct_workout_weight(id_key,'fwb-weight-correction-test@example.invalid',-5,revision);
    raise exception 'Negative correction unexpectedly succeeded';
  exception when invalid_parameter_value then null; end;
  assert public.coach_correct_workout_weight(id_key,'fwb-weight-correction-test@example.invalid',60.25,revision)=1;
  select * into saved from public.client_workout_logs where id=id_key;
  assert saved.weight_used=60.25 and saved.reps=8 and saved.notes='Preserve these notes';
  assert saved.exercise_name='Bench press' and saved.entry_date='2026-10-02';
  -- A new revision must block a correction opened before that change.
  update public.client_workout_logs set updated_at=clock_timestamp() where id=id_key;
  select updated_at into revision from public.client_workout_logs where id=id_key;
  begin
    perform public.coach_correct_workout_weight(id_key,'fwb-weight-correction-test@example.invalid',65,revision-interval '1 second');
    raise exception 'Stale correction unexpectedly succeeded';
  exception when serialization_failure then null; end;
  assert public.coach_correct_workout_weight(id_key,'fwb-weight-correction-test@example.invalid',0,revision)=1;
end $$;
-- Even the owning client must not use the coach-only correction endpoint.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","email":"fwb-weight-correction-test@example.invalid","role":"authenticated"}',true);
do $$ begin
  begin
    perform public.coach_correct_workout_weight(current_setting('fwb.test.weight_log')::uuid,'fwb-weight-correction-test@example.invalid',99,now());
    raise exception 'Non-coach correction unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'coach_correct_workout_weight: permissions, scope, decimals, zero, conflicts, metadata passed' as result;
rollback;
