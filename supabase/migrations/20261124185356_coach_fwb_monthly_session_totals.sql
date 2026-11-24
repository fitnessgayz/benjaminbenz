create table public.coach_fwb_monthly_session_totals (
  month_start date primary key check (extract(day from month_start) = 1),
  through_at timestamptz not null,
  completed_count integer not null check (completed_count >= 0),
  cancelled_count integer not null check (cancelled_count >= 0),
  refreshed_at timestamptz not null default statement_timestamp(),
  check (
    (through_at at time zone 'America/Los_Angeles') >= month_start
    and (through_at at time zone 'America/Los_Angeles') <= month_start + interval '1 month'
  )
);

alter table public.coach_fwb_monthly_session_totals enable row level security;
revoke all on table public.coach_fwb_monthly_session_totals from public, anon, authenticated, service_role;
grant select on table public.coach_fwb_monthly_session_totals to authenticated;
grant select, insert, update on table public.coach_fwb_monthly_session_totals to service_role;

create policy "Coach reads FWB monthly session totals"
  on public.coach_fwb_monthly_session_totals for select to authenticated
  using ((select public.is_coach_admin()));

create function public.save_coach_fwb_monthly_session_total(
  p_month_start date, p_through_at timestamptz, p_completed_count integer, p_cancelled_count integer
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_through_at > statement_timestamp() then
    raise exception 'FWB reconciliation cannot include future appointments' using errcode = '22023';
  end if;

  insert into public.coach_fwb_monthly_session_totals as previous (
    month_start, through_at, completed_count, cancelled_count
  ) values (p_month_start, p_through_at, p_completed_count, p_cancelled_count)
  on conflict (month_start) do update set
    through_at = excluded.through_at,
    completed_count = excluded.completed_count,
    cancelled_count = excluded.cancelled_count,
    refreshed_at = statement_timestamp()
  where previous.through_at <= excluded.through_at
    and (previous.through_at, previous.completed_count, previous.cancelled_count)
       is distinct from (excluded.through_at, excluded.completed_count, excluded.cancelled_count);

  return found;
end;
$$;

revoke all on function public.save_coach_fwb_monthly_session_total(date, timestamptz, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.save_coach_fwb_monthly_session_total(date, timestamptz, integer, integer)
  to service_role;
