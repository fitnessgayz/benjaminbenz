-- Local-only bootstrap for legacy tables that predate this repository's migrations.
-- Supabase CLI applies roles.sql before migrations. This file is not deployed by
-- `supabase db push`, and it contains no production data.

create extension if not exists pgcrypto;

-- A direct Postgres-only test boot may run before the local Auth service creates
-- auth.jwt(). Define the same current_setting-backed helper only when absent.
create schema if not exists auth;
do $bootstrap$
begin
  if to_regprocedure('auth.jwt()') is null then
    execute $function$
      create function auth.jwt()
      returns jsonb
      language sql
      stable
      as 'select coalesce(nullif(current_setting(''request.jwt.claims'', true), ''''), ''{}'')::jsonb'
    $function$;
  end if;
end
$bootstrap$;

create table if not exists public.client_programs (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  client_name text not null default '',
  program_title text not null default '',
  program_summary text not null default '',
  fitness_goal text not null default '',
  focus_target text not null default '',
  coach_note_title text not null default '',
  coach_note_body text not null default '',
  height numeric,
  starting_weight numeric,
  starting_bodyfat numeric,
  active boolean not null default true,
  client_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_progress (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  entry_date date not null default current_date,
  bodyweight numeric,
  bodyfat numeric,
  goal_note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.client_workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  entry_date date not null default current_date,
  workout_title text not null default '',
  exercise_name text not null default '',
  set_number integer not null default 1,
  weight_used numeric not null default 0,
  reps numeric,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.client_programs enable row level security;
alter table public.client_progress enable row level security;
alter table public.client_workout_logs enable row level security;

revoke all on public.client_programs from public, anon, authenticated;
revoke all on public.client_progress from public, anon, authenticated;
revoke all on public.client_workout_logs from public, anon, authenticated;

grant select, update on public.client_programs to authenticated;
grant select on public.client_progress to authenticated;
grant select, insert, update on public.client_workout_logs to authenticated;
