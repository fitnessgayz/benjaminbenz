-- Read-only copy of the counted Alex Fitness history, not a credit or attendance ledger.
create table public.coach_alex_fitness_history (
  singleton boolean primary key default true check (singleton),
  source_read_at timestamptz not null,
  sessions jsonb not null check (jsonb_typeof(sessions) = 'array')
);

alter table public.coach_alex_fitness_history enable row level security;
revoke all on table public.coach_alex_fitness_history from public, anon, authenticated, service_role;
grant select on table public.coach_alex_fitness_history to authenticated;
grant select, insert, update on table public.coach_alex_fitness_history to service_role;

create policy "Coach reads Alex Fitness history"
  on public.coach_alex_fitness_history for select to authenticated
  using ((select public.is_coach_admin()));

create function public.save_coach_alex_fitness_history(p_source_read_at timestamptz, p_sessions jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  clean_sessions jsonb;
  valid_count integer;
  unique_count integer;
begin
  if p_source_read_at is null or not isfinite(p_source_read_at) or p_source_read_at > statement_timestamp()
    or jsonb_typeof(p_sessions) is distinct from 'array' then
    raise exception 'Expected a verified Alex Fitness history snapshot' using errcode = '22023';
  end if;

  if jsonb_array_length(p_sessions) not between 1 and 10000 then
    raise exception 'Alex Fitness snapshot must contain 1–10000 sessions' using errcode = '22023';
  end if;

  select jsonb_agg(to_jsonb(entry) order by session_date desc, start_time desc nulls last, package_number desc, session_number desc),
    count(*), count(distinct (package_number, session_number))
  into clean_sessions, valid_count, unique_count
  from jsonb_to_recordset(p_sessions) as entry (
    package_number integer, session_number integer, session_date date, start_time time without time zone
  )
  where package_number > 0 and session_number > 0 and isfinite(session_date)
    and session_date <= (p_source_read_at at time zone 'America/Los_Angeles')::date
    and (start_time is null or start_time < time '24:00:00');

  if valid_count <> jsonb_array_length(p_sessions) or valid_count <> unique_count then
    raise exception 'Snapshot contains an invalid or duplicated Alex Fitness session' using errcode = '22023';
  end if;

  insert into public.coach_alex_fitness_history as prior (singleton, source_read_at, sessions)
  values (true, p_source_read_at, clean_sessions)
  on conflict (singleton) do update set source_read_at = excluded.source_read_at, sessions = excluded.sessions
  where prior.source_read_at < excluded.source_read_at;
  return found;
end;
$$;

revoke all on function public.save_coach_alex_fitness_history(timestamptz, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.save_coach_alex_fitness_history(timestamptz, jsonb) to service_role;
