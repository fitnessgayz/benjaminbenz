update public.exercise_library
set
  name = 'Dumbbell Wolverine',
  aliases = array[
    'Wolverine',
    'Wolverines',
    'Wolverine Dumbbell',
    'Wolverine Dumbbell Fly',
    'Standing Dumbbell Wolverine',
    'Inner Chest Dumbbell Raise'
  ]::text[],
  primary_muscle = 'chest',
  secondary_muscles = array['shoulders', 'biceps']::text[],
  equipment = 'dumbbell',
  difficulty = 'beginner',
  movement_pattern = 'chest_fly',
  default_sets = 3,
  default_reps = '8-12 each',
  default_rest_seconds = 60,
  substitution_group = 'chest_fly',
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-09/webp-768/dumbbell-wolverine.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/dumbbell-wolverine.mp4',
  instructions = 'Stand tall holding a dumbbell in each hand with your arms slightly behind your hips and a soft bend in the elbows. Keep your chest lifted and shoulders down. Sweep one dumbbell forward and diagonally across your body to chest height while actively squeezing the inner chest. Pause briefly at peak contraction, then lower under control and alternate sides without twisting your torso.',
  is_approved = true,
  is_active = true,
  sort_order = 65,
  updated_at = now()
where lower(name) = lower('Cross-Body Dumbbell Curl');

do $verify$
declare
  matching_rows integer;
  stale_rows integer;
begin
  select count(*)
  into matching_rows
  from public.exercise_library
  where lower(name) = lower('Dumbbell Wolverine')
    and primary_muscle = 'chest'
    and movement_pattern = 'chest_fly'
    and substitution_group = 'chest_fly'
    and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-09/webp-768/dumbbell-wolverine.webp'
    and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/dumbbell-wolverine.mp4'
    and is_approved = true
    and is_active = true;

  select count(*)
  into stale_rows
  from public.exercise_library
  where lower(name) = lower('Cross-Body Dumbbell Curl');

  if matching_rows <> 1 or stale_rows <> 0 then
    raise exception 'Expected one approved chest-classified Dumbbell Wolverine and no stale curl row; found % and %', matching_rows, stale_rows;
  end if;
end
$verify$;
