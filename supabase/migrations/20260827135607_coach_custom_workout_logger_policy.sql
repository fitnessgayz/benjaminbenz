-- Let authenticated coach admins log in-person sessions for any client while
-- preserving the existing client-only policies for self-service workout logs.
grant select, insert, update, delete
on public.client_workout_logs
to authenticated;

drop policy if exists "Coach admins can create workout logs" on public.client_workout_logs;
drop policy if exists "Coach admins can update workout logs" on public.client_workout_logs;
drop policy if exists "Coach admins can delete workout logs" on public.client_workout_logs;
drop policy if exists "Clients can create their own workout logs" on public.client_workout_logs;
drop policy if exists "Clients can update their own workout logs" on public.client_workout_logs;
drop policy if exists "Clients can delete their own workout logs" on public.client_workout_logs;

create policy "Clients and coach admins can create workout logs"
on public.client_workout_logs
for insert
to authenticated
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
);

create policy "Clients and coach admins can update workout logs"
on public.client_workout_logs
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

create policy "Clients and coach admins can delete workout logs"
on public.client_workout_logs
for delete
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
);
