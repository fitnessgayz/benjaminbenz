-- Cache auth JWT lookups once per statement in new-feature RLS policies.

drop policy if exists "Clients manage own workout drafts" on public.client_workout_drafts;
create policy "Clients manage own workout drafts"
  on public.client_workout_drafts
  for all
  to authenticated
  using (lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')))
  with check (lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

drop policy if exists "Clients can create their own workout comment threads"
  on public.workout_comment_threads;
create policy "Clients can create their own workout comment threads"
  on public.workout_comment_threads
  for insert
  to authenticated
  with check (
    (select auth.uid()) = client_user_id
    and lower(client_email) = lower((select auth.jwt()) ->> 'email')
    and not (select public.is_coach_admin())
  );

drop policy if exists "Clients can submit their own form checks"
  on public.form_check_submissions;
create policy "Clients can submit their own form checks"
  on public.form_check_submissions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = client_id
    and lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );
