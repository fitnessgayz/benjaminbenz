-- Replace the generated card for the existing wide-row variation with the
-- approved client-provided start/end card and attach its demonstration video.
-- Keep this as one canonical exercise so aliases do not create duplicate rows.
update public.exercise_library
set
  aliases = array(
    select distinct alias_name
    from unnest(
      coalesce(aliases, '{}'::text[]) || array[
        'Chest-Supported Dumbbell Row - Wide Grip',
        'Chest-Supported Dumbbell Row (Wide Grip)',
        'Chest Supported Dumbbell Row Wide Grip',
        'Wide-Grip Chest-Supported Dumbbell Row'
      ]::text[]
    ) as alias_name
    where btrim(alias_name) <> ''
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-07/webp-768/chest-supported-dumbbell-wide-row.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/chest-supported-dumbbell-wide-row.mp4',
  instructions = 'Set an incline bench and lie chest-down with a dumbbell in each hand. Brace your trunk and let the weights hang beneath your shoulders. Lead with the elbows wide, rowing the dumbbells toward the sides of your upper chest while keeping your chest on the pad. Pause and squeeze across the upper back, then lower slowly to full arm extension without shrugging.'
where name = 'Chest-Supported Dumbbell Wide Row';

do $verify$
declare
  matching_rows integer;
begin
  select count(*)
  into matching_rows
  from public.exercise_library
  where name = 'Chest-Supported Dumbbell Wide Row'
    and 'Chest-Supported Dumbbell Row - Wide Grip' = any(aliases)
    and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-07/webp-768/chest-supported-dumbbell-wide-row.webp'
    and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/chest-supported-dumbbell-wide-row.mp4';

  if matching_rows <> 1 then
    raise exception 'Expected exactly one mapped Chest-Supported Dumbbell Wide Row row, found %', matching_rows;
  end if;
end
$verify$;
