drop policy if exists "Clients can read their own workout feedback"
  on public.workout_session_feedback;
drop policy if exists "Coach admins can read all workout feedback"
  on public.workout_session_feedback;

create policy "Clients and coach admins can read workout feedback"
  on public.workout_session_feedback
  for select
  to authenticated
  using (
    lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    or (select public.is_coach_admin())
  );
