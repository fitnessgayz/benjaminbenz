create extension if not exists pgcrypto;

create or replace function public.is_coach_admin()
returns boolean
language sql
stable
as $$
  select lower(auth.jwt() ->> 'email') = lower('fwb@benjaminbenz.com');
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.client_programs (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  client_name text not null,
  initials text not null default '',
  program_title text not null,
  program_summary text not null default '',
  sheet_url text,
  fitness_goal text not null default '',
  focus_target text not null default '',
  height text not null default 'Not set',
  starting_weight text not null default 'Not set',
  starting_bodyfat text not null default 'Not set',
  coach_note_title text not null default '',
  coach_note_body text not null default '',
  workouts jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.client_programs
add column if not exists initials text not null default '';

alter table public.client_programs
add column if not exists program_summary text not null default '';

alter table public.client_programs
add column if not exists sheet_url text;

alter table public.client_programs
add column if not exists fitness_goal text not null default '';

alter table public.client_programs
add column if not exists focus_target text not null default '';

alter table public.client_programs
add column if not exists height text not null default 'Not set';

alter table public.client_programs
add column if not exists starting_weight text not null default 'Not set';

alter table public.client_programs
add column if not exists starting_bodyfat text not null default 'Not set';

alter table public.client_programs
add column if not exists coach_note_title text not null default '';

alter table public.client_programs
add column if not exists coach_note_body text not null default '';

alter table public.client_programs
add column if not exists workouts jsonb not null default '[]'::jsonb;

alter table public.client_programs
add column if not exists active boolean not null default true;

alter table public.client_programs enable row level security;

drop policy if exists "Clients can read their own active programs" on public.client_programs;
create policy "Clients can read their own active programs"
on public.client_programs
for select
to authenticated
using (lower(auth.jwt() ->> 'email') = lower(client_email) and active);

drop policy if exists "Coach admins can read all programs" on public.client_programs;
create policy "Coach admins can read all programs"
on public.client_programs
for select
to authenticated
using (public.is_coach_admin());

drop policy if exists "Coach admins can create programs" on public.client_programs;
create policy "Coach admins can create programs"
on public.client_programs
for insert
to authenticated
with check (public.is_coach_admin());

drop policy if exists "Coach admins can update programs" on public.client_programs;
create policy "Coach admins can update programs"
on public.client_programs
for update
to authenticated
using (public.is_coach_admin())
with check (public.is_coach_admin());

create unique index if not exists client_programs_one_active_per_email
on public.client_programs (lower(client_email))
where active;

drop trigger if exists set_client_programs_updated_at on public.client_programs;
create trigger set_client_programs_updated_at
before update on public.client_programs
for each row
execute function public.set_updated_at();

create table if not exists public.client_progress (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  entry_date date not null default current_date,
  bodyweight numeric,
  bodyfat numeric,
  goal_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_email, entry_date)
);

alter table public.client_progress enable row level security;

drop policy if exists "Clients can read their own progress" on public.client_progress;
create policy "Clients can read their own progress"
on public.client_progress
for select
to authenticated
using (lower(auth.jwt() ->> 'email') = lower(client_email));

drop policy if exists "Coach admins can read all progress" on public.client_progress;
create policy "Coach admins can read all progress"
on public.client_progress
for select
to authenticated
using (public.is_coach_admin());

drop policy if exists "Coach admins can create progress" on public.client_progress;
create policy "Coach admins can create progress"
on public.client_progress
for insert
to authenticated
with check (public.is_coach_admin());

drop policy if exists "Coach admins can update progress" on public.client_progress;
create policy "Coach admins can update progress"
on public.client_progress
for update
to authenticated
using (public.is_coach_admin())
with check (public.is_coach_admin());

drop policy if exists "Coach admins can delete progress" on public.client_progress;
create policy "Coach admins can delete progress"
on public.client_progress
for delete
to authenticated
using (public.is_coach_admin());

drop trigger if exists set_client_progress_updated_at on public.client_progress;
create trigger set_client_progress_updated_at
before update on public.client_progress
for each row
execute function public.set_updated_at();

create table if not exists public.client_workout_logs (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  entry_date date not null default current_date,
  workout_title text not null,
  exercise_code text not null default '',
  exercise_name text not null,
  set_number integer not null default 1,
  weight_used numeric not null,
  reps numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_email, entry_date, workout_title, exercise_code, set_number)
);

alter table public.client_workout_logs
add column if not exists set_number integer not null default 1;

alter table public.client_workout_logs
add column if not exists reps numeric;

alter table public.client_workout_logs
add column if not exists notes text;

alter table public.client_workout_logs
drop constraint if exists client_workout_logs_client_email_entry_date_workout_title_exercise_code_key;

alter table public.client_workout_logs
drop constraint if exists client_workout_logs_client_email_entry_date_workout_title_exercise_code_set_number_key;

alter table public.client_workout_logs
add constraint client_workout_logs_client_email_entry_date_workout_title_exercise_code_set_number_key
unique (client_email, entry_date, workout_title, exercise_code, set_number);

alter table public.client_workout_logs enable row level security;

drop policy if exists "Clients can read their own workout logs" on public.client_workout_logs;
create policy "Clients can read their own workout logs"
on public.client_workout_logs
for select
to authenticated
using (lower(auth.jwt() ->> 'email') = lower(client_email));

drop policy if exists "Clients can create their own workout logs" on public.client_workout_logs;
create policy "Clients can create their own workout logs"
on public.client_workout_logs
for insert
to authenticated
with check (lower(auth.jwt() ->> 'email') = lower(client_email));

drop policy if exists "Clients can update their own workout logs" on public.client_workout_logs;
create policy "Clients can update their own workout logs"
on public.client_workout_logs
for update
to authenticated
using (lower(auth.jwt() ->> 'email') = lower(client_email))
with check (lower(auth.jwt() ->> 'email') = lower(client_email));

drop policy if exists "Coach admins can read all workout logs" on public.client_workout_logs;
create policy "Coach admins can read all workout logs"
on public.client_workout_logs
for select
to authenticated
using (public.is_coach_admin());

drop trigger if exists set_client_workout_logs_updated_at on public.client_workout_logs;
create trigger set_client_workout_logs_updated_at
before update on public.client_workout_logs
for each row
execute function public.set_updated_at();

insert into public.client_programs (
  client_email,
  client_name,
  initials,
  program_title,
  program_summary,
  sheet_url,
  fitness_goal,
  focus_target,
  height,
  starting_weight,
  starting_bodyfat,
  workouts,
  active
)
select
  'fwb@benjaminbenz.com',
  'Benjamin',
  'BG',
  'Benjamin Program',
  'Fitness goal: gain muscle/reduce bodyfat. Focus target: chest.',
  'https://docs.google.com/spreadsheets/d/1FwQnaZSlVPRNC__1t-V13qQ3kYjxtMaKyuZnDK1Fx0U/edit?usp=drive_link',
  'Gain muscle/reduce bodyfat',
  'Chest',
  'Not set',
  'Not set',
  'Not set',
  '[
    {
      "title": "Workout 1",
      "focus": "Push",
      "format": "single",
      "exercises": [
        { "code": "A", "name": "Dumbbell Bench Press", "prescription": "15 reps x 4 sets", "rest": "60-90s rest" },
        { "code": "B", "name": "Incline Dumbbell Press", "prescription": "10-12 reps x 3 sets", "rest": "60-90s rest" },
        { "code": "C", "name": "Overhead Shoulder Press", "prescription": "8-10 reps x 3 sets", "rest": "60-90s rest" }
      ]
    },
    {
      "title": "Workout 2",
      "focus": "Superset",
      "format": "superset",
      "exercises": [
        { "code": "A1", "name": "Dumbbell Row", "prescription": "12 reps x 3 sets", "rest": "" },
        { "code": "A2", "name": "Push-Up", "prescription": "12 reps x 3 sets", "rest": "60-90s rest after pair" },
        { "code": "D", "name": "Lateral Raise", "prescription": "12-20 reps x 3 sets", "rest": "45-60s rest" },
        { "code": "E", "name": "Tricep Pushdown", "prescription": "12-15 reps x 3 sets", "rest": "45-60s rest" }
      ]
    },
    {
      "title": "Workout 3",
      "focus": "Circuit",
      "format": "circuit",
      "exercises": [
        { "code": "A", "name": "Goblet Squat", "prescription": "12 reps x 3 rounds", "rest": "" },
        { "code": "B", "name": "Dumbbell Romanian Deadlift", "prescription": "12 reps x 3 rounds", "rest": "" },
        { "code": "C", "name": "Plank", "prescription": "30-45 seconds x 3 rounds", "rest": "60-90s rest after round" }
      ]
    }
  ]'::jsonb,
  true
where not exists (
  select 1
  from public.client_programs
  where lower(client_email) = lower('fwb@benjaminbenz.com')
  and active
);

insert into public.client_progress (
  client_email,
  entry_date,
  bodyweight,
  bodyfat,
  goal_note
)
select
  'fwb@benjaminbenz.com',
  current_date,
  null,
  null,
  'First live portal test.'
where not exists (
  select 1
  from public.client_progress
  where lower(client_email) = lower('fwb@benjaminbenz.com')
);
