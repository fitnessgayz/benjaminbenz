-- Keep legacy website workout saves compatible with the cross-platform
-- continuity columns introduced for the iOS app. Newer clients send stable
-- IDs themselves; older clients rely on these deterministic fallbacks.

create or replace function public.fwb_fill_workout_log_sync_ids()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.session_id is null then
    new.session_id := md5(
      lower(trim(new.client_email)) || '|' ||
      new.entry_date::text || '|' ||
      lower(trim(new.workout_title))
    )::uuid;
  end if;

  if new.set_id is null then
    new.set_id := md5(
      new.session_id::text || '|' ||
      lower(trim(new.exercise_code)) || '|' ||
      new.set_number::text
    )::uuid;
  end if;

  return new;
end;
$$;

revoke all on function public.fwb_fill_workout_log_sync_ids()
from public, anon, authenticated;

drop trigger if exists fwb_fill_client_workout_log_sync_ids
on public.client_workout_logs;

create trigger fwb_fill_client_workout_log_sync_ids
before insert or update of
  client_email,
  entry_date,
  workout_title,
  exercise_code,
  set_number,
  session_id,
  set_id
on public.client_workout_logs
for each row
execute function public.fwb_fill_workout_log_sync_ids();
