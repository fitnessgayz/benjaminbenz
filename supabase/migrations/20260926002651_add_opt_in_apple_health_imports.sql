-- Optional Apple Health imports. No account is opted in by this migration.
create table public.client_apple_health_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  client_email text not null,
  shared_categories text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (shared_categories <@ array['workouts','activity','recovery','bodyWeight']::text[])
);
create table public.client_apple_health_workouts (
  user_id uuid not null references public.client_apple_health_settings(user_id) on delete cascade,
  healthkit_id uuid not null, client_email text not null,
  activity_type text not null check (length(activity_type) between 1 and 100),
  started_at timestamptz not null, ended_at timestamptz not null,
  duration_seconds double precision not null check (duration_seconds between 1 and 604800),
  active_calories double precision check (active_calories between 0 and 100000),
  distance_meters double precision check (distance_meters between 0 and 2000000),
  average_heart_rate double precision check (average_heart_rate between 20 and 300),
  source_name text not null check (length(source_name) <= 200),
  updated_at timestamptz not null default now(),
  primary key (user_id, healthkit_id), check (ended_at >= started_at)
);
create table public.client_apple_health_daily (
  user_id uuid not null references public.client_apple_health_settings(user_id) on delete cascade,
  date date not null, client_email text not null,
  steps double precision check (steps between 0 and 200000),
  sleep_minutes double precision check (sleep_minutes between 0 and 1500),
  resting_heart_rate double precision check (resting_heart_rate between 20 and 300),
  hrv_ms double precision check (hrv_ms between 0 and 2000),
  body_weight_kg double precision check (body_weight_kg between 1 and 700),
  body_weight_sample_id uuid,
  updated_at timestamptz not null default now(), primary key (user_id, date)
);
create index apple_health_settings_email on public.client_apple_health_settings(client_email);
create index apple_health_workouts_email_date on public.client_apple_health_workouts(client_email, started_at desc);
create index apple_health_daily_email_date on public.client_apple_health_daily(client_email, date desc);
alter table public.client_apple_health_settings enable row level security;
alter table public.client_apple_health_workouts enable row level security;
alter table public.client_apple_health_daily enable row level security;
-- Only guarded transactional RPCs write these tables, including for the owner.
revoke all on public.client_apple_health_settings, public.client_apple_health_workouts, public.client_apple_health_daily from public, anon, authenticated;
grant select on public.client_apple_health_settings, public.client_apple_health_workouts, public.client_apple_health_daily to authenticated;
create policy apple_health_settings_read on public.client_apple_health_settings for select to authenticated
using (user_id = (select auth.uid()) or ((select public.is_coach_admin()) and cardinality(shared_categories) > 0));
create policy apple_health_workouts_read on public.client_apple_health_workouts for select to authenticated
using ((user_id = (select auth.uid()) or (select public.is_coach_admin())) and exists (
  select 1 from public.client_apple_health_settings s where s.user_id = client_apple_health_workouts.user_id and 'workouts' = any(s.shared_categories)));
create policy apple_health_daily_read on public.client_apple_health_daily for select to authenticated
using ((user_id = (select auth.uid()) or (select public.is_coach_admin())) and exists (
  select 1 from public.client_apple_health_settings s where s.user_id = client_apple_health_daily.user_id and s.shared_categories && array['activity','recovery','bodyWeight']::text[]));

create function public.set_apple_health_sharing(p_expected_user_id uuid, p_categories text[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; v_categories text[];
begin
  if v_uid is null or p_expected_user_id is distinct from v_uid then raise exception 'Account changed' using errcode='42501'; end if;
  select lower(btrim(email)) into v_email from auth.users where id = v_uid;
  if coalesce(v_email,'') = '' or lower(coalesce(auth.jwt()->>'email','')) <> v_email then raise exception 'Account changed' using errcode='42501'; end if;
  if p_categories is null or cardinality(p_categories) > 4 or array_position(p_categories,null) is not null or not (p_categories <@ array['workouts','activity','recovery','bodyWeight']::text[]) then raise exception 'Invalid categories'; end if;
  select coalesce(array_agg(distinct c order by c),'{}') into v_categories from unnest(p_categories) c;
  insert into public.client_apple_health_settings(user_id,client_email) values(v_uid,v_email) on conflict (user_id) do nothing;
  perform 1 from public.client_apple_health_settings where user_id=v_uid for update;
  update public.client_apple_health_settings set shared_categories=v_categories, client_email=v_email, updated_at=now() where user_id=v_uid;
  if not ('workouts'=any(v_categories)) then delete from public.client_apple_health_workouts where user_id=v_uid; end if;
  update public.client_apple_health_workouts set client_email=v_email where user_id=v_uid;
  update public.client_apple_health_daily set client_email=v_email,
    steps=case when 'activity'=any(v_categories) then steps end,
    sleep_minutes=case when 'recovery'=any(v_categories) then sleep_minutes end,
    resting_heart_rate=case when 'recovery'=any(v_categories) then resting_heart_rate end,
    hrv_ms=case when 'recovery'=any(v_categories) then hrv_ms end,
    body_weight_kg=case when 'bodyWeight'=any(v_categories) then body_weight_kg end,
    body_weight_sample_id=case when 'bodyWeight'=any(v_categories) then body_weight_sample_id end,
    updated_at=now() where user_id=v_uid;
  delete from public.client_apple_health_daily where user_id=v_uid and steps is null and sleep_minutes is null and resting_heart_rate is null and hrv_ms is null and body_weight_kg is null;
end $$;

create function public.replace_apple_health_snapshot(p_expected_user_id uuid, p_since timestamptz, p_since_day date, p_categories text[], p_workouts jsonb, p_daily jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; v_shared text[]; v_row jsonb;
begin
  if v_uid is null or p_expected_user_id is distinct from v_uid then raise exception 'Account changed' using errcode='42501'; end if;
  select lower(btrim(email)) into v_email from auth.users where id=v_uid;
  if coalesce(v_email,'') = '' or lower(coalesce(auth.jwt()->>'email','')) <> v_email then raise exception 'Account changed' using errcode='42501'; end if;
  select shared_categories into v_shared from public.client_apple_health_settings where user_id=v_uid for update;
  if p_categories is null or cardinality(p_categories) not between 1 and 4 or array_position(p_categories,null) is not null or v_shared is null or not (p_categories <@ v_shared) then raise exception 'Sharing consent required' using errcode='42501'; end if;
  if p_since is null or not (p_since between now()-interval '32 days' and now()) or p_since_day is null or not (p_since_day between current_date-32 and current_date+1) or abs(p_since_day - (p_since at time zone 'UTC')::date)>1 then raise exception 'Invalid import window'; end if;
  if p_workouts is null or p_daily is null or jsonb_typeof(p_workouts)<>'array' or jsonb_typeof(p_daily)<>'array' or jsonb_array_length(p_workouts)>1000 or jsonb_array_length(p_daily)>32 or octet_length(p_workouts::text)+octet_length(p_daily::text)>2000000 then raise exception 'Invalid snapshot size'; end if;
  if exists(select 1 from jsonb_array_elements(p_workouts) x group by x->>'healthkit_id' having count(*)>1) or exists(select 1 from jsonb_array_elements(p_daily) x group by x->>'date' having count(*)>1) then raise exception 'Duplicate snapshot identity'; end if;
  if not ('workouts'=any(p_categories)) and jsonb_array_length(p_workouts)>0 then raise exception 'Unexpected workout data'; end if;
  -- Validate every row before reconciling. Table checks reject nonfinite/out-of-range numbers.
  for v_row in select value from jsonb_array_elements(p_workouts) loop
    if jsonb_typeof(v_row)<>'object' or (v_row->>'started_at') is null or (v_row->>'ended_at') is null or not ((v_row->>'started_at')::timestamptz between p_since and now()+interval '5 minutes') or (v_row->>'ended_at')::timestamptz > now()+interval '5 minutes' then raise exception 'Invalid workout date'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_daily) loop
    if jsonb_typeof(v_row)<>'object' or (v_row->>'date') is null or not ((v_row->>'date')::date between p_since_day and current_date+1) then raise exception 'Invalid daily date'; end if;
  end loop;
  if 'workouts'=any(p_categories) then
    delete from public.client_apple_health_workouts w where w.user_id=v_uid and (w.started_at < now()-interval '32 days' or (w.started_at>=p_since and not exists(select 1 from jsonb_array_elements(p_workouts) x where (x->>'healthkit_id')::uuid=w.healthkit_id)));
    insert into public.client_apple_health_workouts(user_id,healthkit_id,client_email,activity_type,started_at,ended_at,duration_seconds,active_calories,distance_meters,average_heart_rate,source_name)
    select v_uid,x.healthkit_id,v_email,x.activity_type,x.started_at,x.ended_at,x.duration_seconds,x.active_calories,x.distance_meters,x.average_heart_rate,x.source_name
    from jsonb_to_recordset(p_workouts) as x(healthkit_id uuid,activity_type text,started_at timestamptz,ended_at timestamptz,duration_seconds double precision,active_calories double precision,distance_meters double precision,average_heart_rate double precision,source_name text)
    on conflict(user_id,healthkit_id) do update set client_email=excluded.client_email,activity_type=excluded.activity_type,started_at=excluded.started_at,ended_at=excluded.ended_at,duration_seconds=excluded.duration_seconds,active_calories=excluded.active_calories,distance_meters=excluded.distance_meters,average_heart_rate=excluded.average_heart_rate,source_name=excluded.source_name,updated_at=now();
  end if;
  -- Reset only queried fields, including deleted/denied samples absent from the snapshot.
  update public.client_apple_health_daily set
    steps=case when 'activity'=any(p_categories) then null else steps end,
    sleep_minutes=case when 'recovery'=any(p_categories) then null else sleep_minutes end,
    resting_heart_rate=case when 'recovery'=any(p_categories) then null else resting_heart_rate end,
    hrv_ms=case when 'recovery'=any(p_categories) then null else hrv_ms end,
    body_weight_kg=case when 'bodyWeight'=any(p_categories) then null else body_weight_kg end,
    body_weight_sample_id=case when 'bodyWeight'=any(p_categories) then null else body_weight_sample_id end
    where user_id=v_uid and date>=p_since_day;
  insert into public.client_apple_health_daily(user_id,date,client_email,steps,sleep_minutes,resting_heart_rate,hrv_ms,body_weight_kg,body_weight_sample_id)
  select v_uid,x.date,v_email,
    case when 'activity'=any(p_categories) then x.steps end,
    case when 'recovery'=any(p_categories) then x.sleep_minutes end,
    case when 'recovery'=any(p_categories) then x.resting_heart_rate end,
    case when 'recovery'=any(p_categories) then x.hrv_ms end,
    case when 'bodyWeight'=any(p_categories) then x.body_weight_kg end,
    case when 'bodyWeight'=any(p_categories) then x.body_weight_sample_id end
  from jsonb_to_recordset(p_daily) as x(date date,steps double precision,sleep_minutes double precision,resting_heart_rate double precision,hrv_ms double precision,body_weight_kg double precision,body_weight_sample_id uuid)
  on conflict(user_id,date) do update set client_email=excluded.client_email,
    steps=case when 'activity'=any(p_categories) then excluded.steps else client_apple_health_daily.steps end,
    sleep_minutes=case when 'recovery'=any(p_categories) then excluded.sleep_minutes else client_apple_health_daily.sleep_minutes end,
    resting_heart_rate=case when 'recovery'=any(p_categories) then excluded.resting_heart_rate else client_apple_health_daily.resting_heart_rate end,
    hrv_ms=case when 'recovery'=any(p_categories) then excluded.hrv_ms else client_apple_health_daily.hrv_ms end,
    body_weight_kg=case when 'bodyWeight'=any(p_categories) then excluded.body_weight_kg else client_apple_health_daily.body_weight_kg end,
    body_weight_sample_id=case when 'bodyWeight'=any(p_categories) then excluded.body_weight_sample_id else client_apple_health_daily.body_weight_sample_id end,
    updated_at=now();
  delete from public.client_apple_health_daily where user_id=v_uid and (date<current_date-32 or (steps is null and sleep_minutes is null and resting_heart_rate is null and hrv_ms is null and body_weight_kg is null));
end $$;
revoke all on function public.set_apple_health_sharing(uuid,text[]) from public, anon, authenticated;
revoke all on function public.replace_apple_health_snapshot(uuid,timestamptz,date,text[],jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.set_apple_health_sharing(uuid,text[]) to authenticated;
grant execute on function public.replace_apple_health_snapshot(uuid,timestamptz,date,text[],jsonb,jsonb) to authenticated;
