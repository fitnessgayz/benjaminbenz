+-- Additive schema for the Benjamin AI Coach MCP integration.
-- Reuses the live client_programs, client_progress, and client_workout_logs tables.

create extension if not exists pgcrypto;

create or replace function public.is_coach_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(coalesce((select auth.jwt() ->> 'email'), '')) =
    lower('benjaminbenz.fit@gmail.com');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.client_progress_notes (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  occurred_on date not null default current_date,
  category text not null check (
    category in ('strength', 'mobility', 'conditioning', 'body_composition', 'habit', 'recovery', 'general')
  ),
  metric_name text check (metric_name is null or char_length(metric_name) <= 100),
  numeric_value numeric,
  unit text check (unit is null or char_length(unit) <= 40),
  note text not null check (char_length(note) between 1 and 1000),
  source text not null default 'chatgpt_plugin' check (
    source in ('coach', 'client_portal', 'chatgpt_plugin')
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.client_check_ins (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  occurred_on date not null default current_date,
  energy smallint check (energy between 1 and 5),
  sleep_hours numeric(4,1) check (sleep_hours between 0 and 24),
  stress smallint check (stress between 1 and 5),
  soreness smallint check (soreness between 1 and 5),
  win text check (win is null or char_length(win) <= 500),
  challenge text check (challenge is null or char_length(challenge) <= 500),
  note text check (note is null or char_length(note) <= 1000),
  source text not null default 'chatgpt_plugin' check (
    source in ('coach', 'client_portal', 'chatgpt_plugin')
  ),
  created_at timestamptz not null default now()
);

create table if not exists public.coach_requests (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  request_type text not null check (
    request_type in ('program_review', 'scheduling', 'pain_or_injury', 'motivation', 'nutrition', 'other')
  ),
  urgency text not null default 'routine' check (urgency in ('routine', 'soon', 'urgent')),
  message text not null check (char_length(message) between 3 and 2000),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'closed')),
  source text not null default 'chatgpt_plugin' check (
    source in ('client_portal', 'chatgpt_plugin')
  ),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists client_progress_notes_email_date_idx
  on public.client_progress_notes (lower(client_email), occurred_on desc);
create index if not exists client_check_ins_email_date_idx
  on public.client_check_ins (lower(client_email), occurred_on desc);
create index if not exists coach_requests_email_status_idx
  on public.coach_requests (lower(client_email), status, created_at desc);

alter table public.client_progress_notes enable row level security;
alter table public.client_check_ins enable row level security;
alter table public.coach_requests enable row level security;

revoke all on public.client_progress_notes from public, anon, authenticated;
revoke all on public.client_check_ins from public, anon, authenticated;
revoke all on public.coach_requests from public, anon, authenticated;

grant select, insert on public.client_progress_notes to authenticated;
grant select, insert on public.client_check_ins to authenticated;
grant select, insert, update on public.coach_requests to authenticated;

drop policy if exists "Clients and coach can read progress notes" on public.client_progress_notes;
create policy "Clients and coach can read progress notes"
on public.client_progress_notes
for select
to authenticated
using (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can create their progress notes" on public.client_progress_notes;
create policy "Clients can create their progress notes"
on public.client_progress_notes
for insert
to authenticated
with check (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  and source = 'chatgpt_plugin'
);

drop policy if exists "Clients and coach can read check-ins" on public.client_check_ins;
create policy "Clients and coach can read check-ins"
on public.client_check_ins
for select
to authenticated
using (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can create their check-ins" on public.client_check_ins;
create policy "Clients can create their check-ins"
on public.client_check_ins
for insert
to authenticated
with check (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  and source = 'chatgpt_plugin'
);

drop policy if exists "Clients and coach can read coach requests" on public.coach_requests;
create policy "Clients and coach can read coach requests"
on public.coach_requests
for select
to authenticated
using (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can create their coach requests" on public.coach_requests;
create policy "Clients can create their coach requests"
on public.coach_requests
for insert
to authenticated
with check (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  and source = 'chatgpt_plugin'
);

drop policy if exists "Coach can update coach requests" on public.coach_requests;
create policy "Coach can update coach requests"
on public.coach_requests
for update
to authenticated
using ((select public.is_coach_admin()))
with check ((select public.is_coach_admin()));

-- Preserve existing access behavior while allowing PostgreSQL to initialize auth.jwt() once per query.
drop policy if exists "Clients can read their own active programs" on public.client_programs;
create policy "Clients can read their own active programs"
on public.client_programs
for select
to authenticated
using (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  and active
  and client_archived = false
);

drop policy if exists "Clients can update their own metrics" on public.client_programs;
create policy "Clients can update their own metrics"
on public.client_programs
for update
to authenticated
using (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  and active = true
  and client_archived = false
)
with check (
  lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email)
  and active = true
  and client_archived = false
);

drop policy if exists "Clients can update their own profile fields" on public.client_programs;
create policy "Clients can update their own profile fields"
on public.client_programs
for update
to authenticated
using (
  active is true
  and coalesce(client_archived, false) is false
  and lower(client_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
)
with check (
  active is true
  and coalesce(client_archived, false) is false
  and lower(client_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

drop policy if exists "Clients can read their own progress" on public.client_progress;
create policy "Clients can read their own progress"
on public.client_progress
for select
to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email));

drop policy if exists "Clients can read their own workout logs" on public.client_workout_logs;
create policy "Clients can read their own workout logs"
on public.client_workout_logs
for select
to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email));

drop policy if exists "Clients can create their own workout logs" on public.client_workout_logs;
create policy "Clients can create their own workout logs"
on public.client_workout_logs
for insert
to authenticated
with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email));

drop policy if exists "Clients can update their own workout logs" on public.client_workout_logs;
create policy "Clients can update their own workout logs"
on public.client_workout_logs
for update
to authenticated
using (lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email))
with check (lower(coalesce((select auth.jwt() ->> 'email'), '')) = lower(client_email));
