-- Restore coach-admin access to client_progress and client_workout_logs.
-- The pre-migration setup scripts granted the coach admin read/write access
-- to both tables via is_coach_admin(), but that access was never carried
-- over when the schema moved into supabase/migrations. As a result the
-- coach admin dashboard could not read a client's progress or workout log
-- history, and saving a check-in on a client's behalf failed RLS entirely.

drop policy if exists "Clients can read their own progress" on public.client_progress;
create policy "Clients and coach admins can read progress"
on public.client_progress
for select
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can create their own progress" on public.client_progress;
create policy "Clients and coach admins can create progress"
on public.client_progress
for insert
to authenticated
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can update their own progress" on public.client_progress;
create policy "Clients and coach admins can update progress"
on public.client_progress
for update
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
)
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can read their own workout logs" on public.client_workout_logs;
create policy "Clients and coach admins can read workout logs"
on public.client_workout_logs
for select
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
);
