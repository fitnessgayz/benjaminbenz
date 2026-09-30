-- Make the read-marker RPC use the caller's RLS permissions instead of
-- elevated SECURITY DEFINER privileges. A guard trigger stamps server time and
-- prevents either participant from changing the other participant's state.

alter function public.mark_workout_comment_thread_read(uuid) security invoker;

create or replace function public.protect_workout_comment_read_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select public.is_coach_admin()) then
    if new.client_last_read_at is distinct from old.client_last_read_at then
      raise exception 'Coach cannot change the client read timestamp' using errcode = '42501';
    end if;
    if new.coach_last_read_at is distinct from old.coach_last_read_at then
      new.coach_last_read_at = now();
    end if;
  else
    if new.coach_last_read_at is distinct from old.coach_last_read_at then
      raise exception 'Client cannot change the coach read timestamp' using errcode = '42501';
    end if;
    if new.client_last_read_at is distinct from old.client_last_read_at then
      new.client_last_read_at = now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_workout_comment_read_state() from public, anon, authenticated;

drop trigger if exists protect_workout_comment_read_state_before_update
  on public.workout_comment_threads;
create trigger protect_workout_comment_read_state_before_update
before update of client_last_read_at, coach_last_read_at
on public.workout_comment_threads
for each row execute function public.protect_workout_comment_read_state();

drop policy if exists "Participants can update workout comment read state"
  on public.workout_comment_threads;
create policy "Participants can update workout comment read state"
  on public.workout_comment_threads for update to authenticated
  using (
    (select auth.uid()) = client_user_id
    or (select public.is_coach_admin())
  )
  with check (
    (select auth.uid()) = client_user_id
    or (select public.is_coach_admin())
  );

grant update (client_last_read_at, coach_last_read_at)
  on table public.workout_comment_threads to authenticated;
