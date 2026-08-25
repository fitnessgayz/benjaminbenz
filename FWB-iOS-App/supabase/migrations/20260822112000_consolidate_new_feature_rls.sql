-- Keep one permissive policy per role/action for the new collaboration features.

drop policy if exists "Clients can update their own iOS check-ins" on public.client_check_ins;
drop policy if exists "Coach admin can update client check-ins" on public.client_check_ins;
drop policy if exists "Clients and coach can update check-ins" on public.client_check_ins;
create policy "Clients and coach can update check-ins"
  on public.client_check_ins for update to authenticated
  using (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
    or (select public.is_coach_admin())
  )
  with check (
    (
      lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
      and source = 'ios_app'
    )
    or (select public.is_coach_admin())
  );

drop policy if exists "Clients can read their own workout comment threads"
  on public.workout_comment_threads;
drop policy if exists "Coach admins can read workout comment threads"
  on public.workout_comment_threads;
drop policy if exists "Participants can read workout comment threads"
  on public.workout_comment_threads;
create policy "Participants can read workout comment threads"
  on public.workout_comment_threads for select to authenticated
  using (
    (select auth.uid()) = client_user_id
    or (select public.is_coach_admin())
  );

drop policy if exists "Clients can add their own workout comments"
  on public.workout_comments;
drop policy if exists "Coach admins can reply to workout comments"
  on public.workout_comments;
drop policy if exists "Participants can add workout comments"
  on public.workout_comments;
create policy "Participants can add workout comments"
  on public.workout_comments for insert to authenticated
  with check (
    author_user_id = (select auth.uid())
    and (
      (
        author_role = 'client'
        and not (select public.is_coach_admin())
        and exists (
          select 1
          from public.workout_comment_threads thread
          where thread.id = workout_comments.thread_id
            and thread.client_user_id = (select auth.uid())
        )
      )
      or (
        author_role = 'coach'
        and (select public.is_coach_admin())
      )
    )
  );
