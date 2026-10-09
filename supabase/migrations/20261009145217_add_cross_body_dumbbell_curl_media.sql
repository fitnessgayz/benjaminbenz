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
  image_url,
  motion_url,
  instructions,
  is_approved,
  is_active,
  sort_order
)
values (
  'Cross-Body Dumbbell Curl',
  array[
    'Alternating Dumbbell Cross-Body Curl',
    'Cross-Body Biceps Curl',
    'Dumbbell Cross-Body Curl',
    'Wolverine Curl',
    'Wolverine Curls',
    'Wolverine Dumbbell Curl'
  ]::text[],
  'biceps',
  array['forearms']::text[],
  'dumbbell',
  'beginner',
  'elbow_flexion',
  3,
  '8-12 each',
  60,
  'biceps_curl',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-09/webp-768/cross-body-dumbbell-curl.webp',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/cross-body-dumbbell-curl.mp4',
  'Stand tall holding a dumbbell in each hand with your arms long and palms facing inward. Keep your elbows close to your sides and your torso still. Curl one dumbbell diagonally across your body toward the opposite side of your chest without letting the elbow drift forward. Squeeze the biceps briefly, lower under control, and alternate sides.',
  true,
  true,
  282
)
on conflict (lower(name)) do update set
  aliases = array(
    select distinct alias
    from unnest(coalesce(public.exercise_library.aliases, '{}'::text[]) || excluded.aliases) as alias
  ),
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  difficulty = excluded.difficulty,
  movement_pattern = excluded.movement_pattern,
  default_sets = excluded.default_sets,
  default_reps = excluded.default_reps,
  default_rest_seconds = excluded.default_rest_seconds,
  substitution_group = excluded.substitution_group,
  image_url = excluded.image_url,
  motion_url = excluded.motion_url,
  instructions = excluded.instructions,
  is_approved = true,
  is_active = true,
  updated_at = now();

do $verify$
declare
  matching_rows integer;
begin
  select count(*)
  into matching_rows
  from public.exercise_library
  where lower(name) = lower('Cross-Body Dumbbell Curl')
    and primary_muscle = 'biceps'
    and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-09/webp-768/cross-body-dumbbell-curl.webp'
    and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/cross-body-dumbbell-curl.mp4'
    and is_approved = true
    and is_active = true;

  if matching_rows <> 1 then
    raise exception 'Expected exactly one approved Cross-Body Dumbbell Curl row, found %', matching_rows;
  end if;
end
$verify$;
