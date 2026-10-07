-- Keep the same exercise and media, but present it as the general single-arm
-- machine-row movement rather than a straddle-specific variation.
update public.exercise_library
set
  name = 'Single-Arm Machine Row',
  aliases = array[
    'Single Arm Machine Row',
    'Single-Arm Plate-Loaded Row',
    'Unilateral Machine Row',
    'Iso-Lateral Single-Arm Row'
  ]::text[],
  instructions = 'Face the machine and plant both feet securely. Brace your non-working arm against the chest pad and grip the working-side handle with a long arm and shoulder down. Pull the elbow back beside your torso without rotating or leaning away. Pause and squeeze the back, then return slowly to full arm extension while keeping your torso supported.',
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-07/webp-768/single-arm-machine-row.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/single-arm-machine-row.mp4'
where lower(name) = lower('Single-Arm Machine Row (Straddle)');

do $verify$
declare
  matching_rows integer;
  old_rows integer;
begin
  select count(*)
  into matching_rows
  from public.exercise_library
  where lower(name) = lower('Single-Arm Machine Row')
    and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-07/webp-768/single-arm-machine-row.webp'
    and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/single-arm-machine-row.mp4'
    and not ('Straddle Single-Arm Machine Row' = any(aliases));

  select count(*)
  into old_rows
  from public.exercise_library
  where lower(name) = lower('Single-Arm Machine Row (Straddle)');

  if matching_rows <> 1 or old_rows <> 0 then
    raise exception 'Expected one generic Single-Arm Machine Row and no straddle row; found % generic and % straddle', matching_rows, old_rows;
  end if;
end
$verify$;
