create table if not exists public.client_programs (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  client_name text not null,
  client_phone text not null default '',
  initials text not null default '',
  program_title text not null,
  program_summary text not null default '',
  sheet_url text,
  session_count_used integer not null default 0,
  session_count_total integer not null default 0,
  session_dates jsonb not null default '[]'::jsonb,
  fitness_goal text not null default '',
  focus_target text not null default '',
  height text not null default 'Not set',
  starting_weight text not null default 'Not set',
  starting_bodyfat text not null default 'Not set',
  coach_note_title text not null default '',
  coach_note_body text not null default '',
  workouts jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  client_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_programs
add column if not exists client_phone text not null default '';

alter table public.client_programs
add column if not exists client_archived boolean not null default false;

alter table public.client_programs
add column if not exists session_count_used integer not null default 0;

alter table public.client_programs
add column if not exists session_count_total integer not null default 0;

alter table public.client_programs
add column if not exists session_dates jsonb not null default '[]'::jsonb;

update public.client_programs cp
set client_archived = true
where not exists (
  select 1
  from public.client_programs active_program
  where lower(active_program.client_email) = lower(cp.client_email)
  and active_program.active = true
);

alter table public.client_programs enable row level security;

drop policy if exists "Clients can read their own active programs" on public.client_programs;
create policy "Clients can read their own active programs"
on public.client_programs
for select
to authenticated
using (lower(auth.jwt() ->> 'email') = lower(client_email) and active and client_archived = false);

create unique index if not exists client_programs_one_active_per_email
on public.client_programs (lower(client_email))
where active;
