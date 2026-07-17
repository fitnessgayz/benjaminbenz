create or replace function public.is_coach_admin()
returns boolean
language sql
stable
as $$
  select lower(auth.jwt() ->> 'email') = lower('benjaminbenz.fit@gmail.com');
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

drop policy if exists "Clients can delete their own workout logs" on public.client_workout_logs;
create policy "Clients can delete their own workout logs"
on public.client_workout_logs
for delete
to authenticated
using (lower(auth.jwt() ->> 'email') = lower(client_email));

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
