-- Exercise the actual RPC under coach RLS; every test edit is rolled back.
begin;
create temp table correction_case as
select client_email, exercise_name
from public.client_workout_logs
where upper(btrim(coalesce(exercise_code,''))) not in ('WARMUP','CARDIO')
  and char_length(btrim(exercise_name)) between 2 and 120
limit 1;
create temp table correction_before as
select l.id, to_jsonb(l) as original
from public.client_workout_logs l, correction_case c
where lower(btrim(l.client_email))=lower(btrim(c.client_email))
  and lower(regexp_replace(btrim(l.exercise_name),'[[:space:]]+',' ','g'))
      =lower(regexp_replace(btrim(c.exercise_name),'[[:space:]]+',' ','g'))
  and upper(btrim(coalesce(l.exercise_code,''))) not in ('WARMUP','CARDIO');
grant select on correction_case, correction_before to authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub',id,'email',email,'role','authenticated')::text,true)
from auth.users where lower(email)='benjaminbenz.fit@gmail.com' limit 1;
set local role authenticated;
do $$
declare
  client_email text;
  previous_name text;
  affected integer;
  expected integer;
begin
  select c.client_email,c.exercise_name into client_email,previous_name from correction_case c;
  select count(*) into expected from correction_before;
  assert expected>0, 'Need an existing exercise for rollback test';
  affected := public.correct_client_exercise_name(client_email,previous_name,'Correction verification exercise');
  assert affected=expected, 'Coach must correct every matching set under RLS';
  assert not exists(
    select 1 from public.client_workout_logs l join correction_before b on b.id=l.id
    where (to_jsonb(l)-'exercise_name'-'original_exercise_name'-'updated_at')
       is distinct from (b.original-'exercise_name'-'original_exercise_name'-'updated_at')
       or l.exercise_name<>'Correction verification exercise'
       or l.original_exercise_name is distinct from coalesce(b.original->>'original_exercise_name',b.original->>'exercise_name')
  ), 'Only the label and original-label audit field may change';
  affected := public.correct_client_exercise_name(client_email,'Correction verification exercise','Correction verification exercise');
  assert affected=0, 'Repeated correction must be a no-op';
  begin
    perform public.correct_client_exercise_name(client_email,'Correction verification exercise','x');
    raise exception 'Expected invalid name to fail';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims','{"email":"unrelated-client@example.invalid","role":"authenticated"}',true);
  begin
    perform public.correct_client_exercise_name(client_email,'Correction verification exercise','Unauthorized correction');
    raise exception 'Expected another client to be denied';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
rollback;
