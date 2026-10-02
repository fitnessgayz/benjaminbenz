-- Run as database administrator. All writes are rolled back, including failures.
begin;
do $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', id, 'email', email, 'role','authenticated')::text, true)
  from auth.users where email not in ('benjaminbenz.fit@gmail.com') order by created_at limit 1;
end $$;
set local role authenticated;
do $$
declare owner_id uuid := auth.uid(); denied boolean := false;
begin
  if owner_id is null then raise exception 'A client account is required for the RLS test'; end if;
  insert into public.client_quarterly_goals(client_id,quarter_start,workouts_week,workouts_month,workouts_quarter,visits_week,visits_month,visits_quarter,weight_target)
  values(owner_id,'1900-01-01',3,12,36,3,12,36,180)
  on conflict(client_id,quarter_start) do update set weight_target=180;
  if not exists(select 1 from public.client_quarterly_goals where client_id=owner_id and quarter_start='1900-01-01' and weight_target=180) then raise exception 'Owner insert/select failed'; end if;
  update public.client_quarterly_goals set weight_target=null where client_id=owner_id and quarter_start='1900-01-01';
  if not exists(select 1 from public.client_quarterly_goals where client_id=owner_id and quarter_start='1900-01-01' and weight_target is null) then raise exception 'Owner clearing a body goal failed'; end if;
  begin
    update public.client_quarterly_goals set client_id='00000000-0000-4000-8000-000000000001' where client_id=owner_id and quarter_start='1900-01-01';
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Owner reassignment was allowed'; end if;
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","email":"quarter-goal-test@example.invalid","role":"authenticated"}',true);
  if exists(select 1 from public.client_quarterly_goals where client_id=owner_id and quarter_start='1900-01-01') then raise exception 'Foreign client could read another plan'; end if;
  if has_table_privilege('anon','public.client_quarterly_goals','select') or has_table_privilege('anon','public.client_quarterly_goals','insert') then raise exception 'Anonymous access granted'; end if;
end $$;
rollback;
