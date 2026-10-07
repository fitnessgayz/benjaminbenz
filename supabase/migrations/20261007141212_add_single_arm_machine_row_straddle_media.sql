-- Add the straddle single-arm machine row as its own canonical movement.
-- The variation uses a distinct setup and must not be merged into two-arm
-- machine rows or dumbbell rows.
insert into public.exercise_library (
  name,
  aliases,
  primary_muscle,
  secondary_muscles,
  equipment,
  difficulty,
  movement_pattern,
  default_sets,
  default_reps,
  default_rest_seconds,
  substitution_group,
  instructions,
  image_url,
  motion_url,
  is_approved,
  is_active,
  sort_order
)
select
  'Single-Arm Machine Row (Straddle)',
  array[
    'Single Arm Machine Row Straddle',
    'Straddle Single-Arm Machine Row',
    'Single-Arm Plate-Loaded Row (Straddle)',
    'Unilateral Machine Row (Straddle)'
  ]::text[],
  'back',
  array['lats', 'biceps']::text[],
  'machine',
  'beginner',
  'horizontal_pull',
  3,
  '8-12 each',
  75,
  'horizontal_pull',
  'Straddle the machine facing the chest pad and plant both feet securely. Brace your non-working arm against the pad and grip the working-side handle with a long arm and shoulder down. Pull the elbow back beside your torso without rotating or leaning away. Pause and squeeze the back, then return slowly to full arm extension while keeping your torso supported.',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-07/webp-768/single-arm-machine-row-straddle.webp',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/single-arm-machine-row-straddle.mp4',
  true,
  true,
  155
where not exists (
  select 1
  from public.exercise_library
  where lower(name) = lower('Single-Arm Machine Row (Straddle)')
);

update public.exercise_library
set
  aliases = array[
    'Single Arm Machine Row Straddle',
    'Straddle Single-Arm Machine Row',
    'Single-Arm Plate-Loaded Row (Straddle)',
    'Unilateral Machine Row (Straddle)'
  ]::text[],
  primary_muscle = 'back',
  secondary_muscles = array['lats', 'biceps']::text[],
  equipment = 'machine',
  difficulty = 'beginner',
  movement_pattern = 'horizontal_pull',
  default_sets = 3,
  default_reps = '8-12 each',
  default_rest_seconds = 75,
  substitution_group = 'horizontal_pull',
  instructions = 'Straddle the machine facing the chest pad and plant both feet securely. Brace your non-working arm against the pad and grip the working-side handle with a long arm and shoulder down. Pull the elbow back beside your torso without rotating or leaning away. Pause and squeeze the back, then return slowly to full arm extension while keeping your torso supported.',
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-07/webp-768/single-arm-machine-row-straddle.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/single-arm-machine-row-straddle.mp4',
  is_approved = true,
  is_active = true,
  sort_order = 155
where lower(name) = lower('Single-Arm Machine Row (Straddle)');

do $verify$
declare
  matching_rows integer;
begin
  select count(*)
  into matching_rows
  from public.exercise_library
  where lower(name) = lower('Single-Arm Machine Row (Straddle)')
    and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-07/webp-768/single-arm-machine-row-straddle.webp'
    and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/single-arm-machine-row-straddle.mp4';

  if matching_rows <> 1 then
    raise exception 'Expected exactly one mapped Single-Arm Machine Row (Straddle) row, found %', matching_rows;
  end if;
end
$verify$;
