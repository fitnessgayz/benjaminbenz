create table if not exists public.ai_workout_analysis_usage (
  month_key text primary key,
  usage_count integer not null default 0 check (usage_count >= 0),
  monthly_limit integer not null default 30 check (monthly_limit > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_workout_recommendations (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  client_name text,
  program_title text,
  analysis_text text not null,
  source_logs jsonb not null default '[]'::jsonb,
  usage_month_key text not null,
  usage_count integer not null,
  usage_limit integer not null,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists ai_workout_recommendations_client_email_created_idx
  on public.ai_workout_recommendations (lower(client_email), created_at desc);

alter table public.ai_workout_analysis_usage enable row level security;
alter table public.ai_workout_recommendations enable row level security;

create or replace function public.reserve_ai_workout_analysis_usage(
  p_month_key text,
  p_monthly_limit integer
)
returns table(allowed boolean, usage_count integer, monthly_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_limit integer;
begin
  insert into public.ai_workout_analysis_usage (month_key, monthly_limit)
  values (p_month_key, greatest(coalesce(p_monthly_limit, 30), 1))
  on conflict (month_key) do update
    set monthly_limit = greatest(public.ai_workout_analysis_usage.monthly_limit, excluded.monthly_limit),
        updated_at = now();

  update public.ai_workout_analysis_usage
    set usage_count = public.ai_workout_analysis_usage.usage_count + 1,
        updated_at = now()
    where month_key = p_month_key
      and public.ai_workout_analysis_usage.usage_count < public.ai_workout_analysis_usage.monthly_limit
    returning public.ai_workout_analysis_usage.usage_count,
              public.ai_workout_analysis_usage.monthly_limit
      into v_count, v_limit;

  if v_count is null then
    select public.ai_workout_analysis_usage.usage_count,
           public.ai_workout_analysis_usage.monthly_limit
      into v_count, v_limit
      from public.ai_workout_analysis_usage
      where month_key = p_month_key;

    return query select false, coalesce(v_count, 0), coalesce(v_limit, greatest(coalesce(p_monthly_limit, 30), 1));
    return;
  end if;

  return query select true, v_count, v_limit;
end;
$$;

create or replace function public.release_ai_workout_analysis_usage(p_month_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_workout_analysis_usage
    set usage_count = greatest(usage_count - 1, 0),
        updated_at = now()
    where month_key = p_month_key;
end;
$$;

revoke all on function public.reserve_ai_workout_analysis_usage(text, integer) from public, anon, authenticated;
revoke all on function public.release_ai_workout_analysis_usage(text) from public, anon, authenticated;
grant execute on function public.reserve_ai_workout_analysis_usage(text, integer) to service_role;
grant execute on function public.release_ai_workout_analysis_usage(text) to service_role;
