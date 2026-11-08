-- Save a private snapshot before telling an active client that their report is ready.
create table if not exists public.client_monthly_training_reports (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  report_month date not null,
  client_name text not null,
  workouts integer not null default 0,
  working_sets integer not null default 0,
  active_weeks integer not null default 0,
  exercise_count integer not null default 0,
  highlights jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  constraint client_monthly_training_reports_month_start
    check (report_month = date_trunc('month', report_month::timestamp)::date),
  constraint client_monthly_training_reports_nonnegative
    check (workouts >= 0 and working_sets >= 0 and active_weeks >= 0 and exercise_count >= 0),
  constraint client_monthly_training_reports_unique unique (client_email, report_month)
);

create index if not exists client_monthly_training_reports_latest
  on public.client_monthly_training_reports (client_email, report_month desc);

alter table public.client_monthly_training_reports enable row level security;
create policy "Clients and coach read monthly training reports"
  on public.client_monthly_training_reports for select to authenticated
  using (
    lower(client_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
    or (select public.is_coach_admin())
  );
revoke all on public.client_monthly_training_reports from public, anon, authenticated;
grant select on public.client_monthly_training_reports to authenticated;

alter table public.client_notification_preferences
  add column if not exists monthly_reports boolean not null default true;

create or replace function fwb_private.generate_monthly_training_reports(
  p_report_month date default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report_month date := coalesce(
    p_report_month,
    date_trunc('month', (now() at time zone 'America/Los_Angeles')::date - interval '1 month')::date
  );
  next_month date;
  client_record record;
  inserted_count integer := 0;
  report_inserted integer;
  report_label text;
  notification_dedupe text;
begin
  if v_report_month <> date_trunc('month', v_report_month::timestamp)::date
     or v_report_month >= date_trunc('month', (now() at time zone 'America/Los_Angeles')::date)::date then
    raise exception 'Report month must be a completed calendar month';
  end if;
  next_month := (v_report_month + interval '1 month')::date;
  report_label := trim(to_char(v_report_month, 'Month YYYY'));

  for client_record in
    select distinct on (lower(btrim(p.client_email)))
      lower(btrim(p.client_email)) as email,
      coalesce(nullif(btrim(p.client_name), ''), 'Client') as name,
      u.id as user_id,
      coalesce(prefs.monthly_reports, true) as notifications_enabled
    from public.client_programs p
    join auth.users u on lower(btrim(u.email)) = lower(btrim(p.client_email))
      and u.deleted_at is null
    left join public.client_notification_preferences prefs on prefs.user_id = u.id
    where p.account_type = 'client' and p.active is true
      and p.client_archived is not true and nullif(btrim(p.client_email), '') is not null
    order by lower(btrim(p.client_email)), p.updated_at desc nulls last, p.created_at desc
  loop
    with working_logs as (
      select l.entry_date, l.session_id, l.exercise_name, l.exercise_code,
             l.weight_used, l.reps
      from public.client_workout_logs l
      where lower(btrim(l.client_email)) = client_record.email
        and l.entry_date >= v_report_month and l.entry_date < next_month
        and upper(coalesce(l.exercise_code, '')) not in ('WARMUP', 'CARDIO')
        and lower(coalesce(l.set_type, '')) not in ('warm_up', 'warmup')
        and (coalesce(l.weight_used, 0) > 0 or coalesce(l.reps, 0) > 0)
    ),
    best_exercises as (
      select coalesce(nullif(btrim(exercise_name), ''), nullif(btrim(exercise_code), ''), 'Exercise') as name,
             weight_used, reps,
             row_number() over (
               partition by lower(coalesce(nullif(btrim(exercise_name), ''), nullif(btrim(exercise_code), ''), 'Exercise'))
               order by case when coalesce(weight_used, 0) > 0
                           then weight_used * (1 + greatest(coalesce(reps, 0), 0) / 30)
                           else coalesce(reps, 0) end desc,
                        weight_used desc nulls last, reps desc nulls last
             ) as exercise_rank
      from working_logs
    ),
    top_exercises as (
      select name, weight_used, reps from best_exercises
      where exercise_rank = 1
      order by case when coalesce(weight_used, 0) > 0
                    then weight_used * (1 + greatest(coalesce(reps, 0), 0) / 30)
                    else coalesce(reps, 0) end desc
      limit 5
    ),
    summary as (
      select count(distinct session_id)::integer as workouts,
             count(*)::integer as working_sets,
             count(distinct ((extract(day from entry_date)::integer - 1) / 7))::integer as active_weeks,
             count(distinct lower(coalesce(nullif(btrim(exercise_name), ''), nullif(btrim(exercise_code), ''), 'Exercise')))::integer as exercise_count
      from working_logs
    )
    insert into public.client_monthly_training_reports
      (client_email, report_month, client_name, workouts, working_sets,
       active_weeks, exercise_count, highlights)
    select client_record.email, v_report_month, client_record.name,
           summary.workouts, summary.working_sets, summary.active_weeks, summary.exercise_count,
           coalesce((select jsonb_agg(jsonb_build_object(
             'name', name, 'type', 'Benchmark',
             'value', case when coalesce(weight_used, 0) > 0 and coalesce(reps, 0) > 0
                       then weight_used::text || ' lb × ' || reps::text
                       when coalesce(weight_used, 0) > 0 then weight_used::text || ' lb'
                       else coalesce(reps, 0)::text || ' reps' end
           )) from top_exercises), '[]'::jsonb)
    from summary
    on conflict (client_email, report_month) do nothing;

    get diagnostics report_inserted = row_count;
    if report_inserted = 0 then continue; end if;
    inserted_count := inserted_count + 1;
    -- An explicitly requested historical month is a quiet backfill. The
    -- scheduled no-argument call is the only path that sends client alerts.
    if p_report_month is not null or client_record.notifications_enabled is false then continue; end if;

    notification_dedupe := 'monthly-report:' || client_record.user_id::text || ':' || to_char(v_report_month, 'YYYY-MM');
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'client_notifications'
        and column_name = 'web_dedupe_key'
    ) then
      insert into public.client_notifications
        (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
      values (
        client_record.user_id, 'monthly_report', 'Your monthly training report is ready',
        'Open FWB to view your private ' || report_label || ' training report.',
        'monthly_report', '/client-dashboard.html?tab=progress&report=' || to_char(v_report_month, 'YYYY-MM'),
        notification_dedupe
      ) on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing;
    else
      perform private.fwb_queue_notification(
        client_record.email, 'client', 'monthly_report',
        'Your monthly training report is ready',
        'Open FWB to view your private ' || report_label || ' training report.',
        '/client-dashboard.html?tab=progress&report=' || to_char(v_report_month, 'YYYY-MM'),
        notification_dedupe, jsonb_build_object('month', to_char(v_report_month, 'YYYY-MM'))
      );
    end if;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function fwb_private.generate_monthly_training_reports(date)
  from public, anon, authenticated;

select cron.schedule(
  'fwb-monthly-training-reports',
  '5 17 1 * *',
  $$select fwb_private.generate_monthly_training_reports();$$
);
