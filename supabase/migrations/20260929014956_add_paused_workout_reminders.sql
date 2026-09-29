create table if not exists public.client_active_workouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workout_title text not null,
  workout_date date not null,
  reminder_kind text not null,
  reminder_started_at timestamptz not null,
  remind_at timestamptz not null,
  reminded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint client_active_workouts_title_length
    check (char_length(btrim(workout_title)) between 1 and 160),
  constraint client_active_workouts_reminder_kind
    check (reminder_kind in ('paused', 'unfinished')),
  constraint client_active_workouts_reminder_order
    check (remind_at >= reminder_started_at)
);

create index if not exists client_active_workouts_due_idx
  on public.client_active_workouts (remind_at)
  where reminded_at is null;

alter table public.client_active_workouts enable row level security;

revoke all on table public.client_active_workouts from public, anon, authenticated;
grant select, insert, update, delete on table public.client_active_workouts to authenticated;
grant select, insert, update, delete on table public.client_active_workouts to service_role;

drop policy if exists "Clients can read their active workout" on public.client_active_workouts;
create policy "Clients can read their active workout"
  on public.client_active_workouts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Clients can create their active workout" on public.client_active_workouts;
create policy "Clients can create their active workout"
  on public.client_active_workouts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Clients can update their active workout" on public.client_active_workouts;
create policy "Clients can update their active workout"
  on public.client_active_workouts
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Clients can delete their active workout" on public.client_active_workouts;
create policy "Clients can delete their active workout"
  on public.client_active_workouts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
