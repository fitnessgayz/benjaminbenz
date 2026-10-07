-- Supports ownership lookups and auth.users cascade cleanup, including tombstones.
create index client_workout_schedule_owner_idx
  on public.client_workout_schedule (owner_user_id);
