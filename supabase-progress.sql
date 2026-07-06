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
