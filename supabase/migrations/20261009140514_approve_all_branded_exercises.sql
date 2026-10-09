-- Every exercise that uses a reviewed FWB card is part of the shared catalog.
-- The public approved/ storage namespace is reserved for branded assets that
-- have already passed review, so these rows are safe to expose to all clients.
update public.exercise_library
set
  is_approved = true,
  is_active = true,
  updated_at = now()
where image_url like 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/%'
  and (not is_approved or not is_active);

do $verify$
declare
  branded_count integer;
  unavailable_count integer;
begin
  select count(*)
  into branded_count
  from public.exercise_library
  where image_url like 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/%';

  select count(*)
  into unavailable_count
  from public.exercise_library
  where image_url like 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/%'
    and (not is_approved or not is_active);

  if branded_count = 0 then
    raise exception 'No branded exercise rows were found';
  end if;

  if unavailable_count <> 0 then
    raise exception 'Expected every branded exercise to be approved and active; % unavailable rows remain', unavailable_count;
  end if;

  raise notice 'Approved and activated % branded exercise rows', branded_count;
end
$verify$;
