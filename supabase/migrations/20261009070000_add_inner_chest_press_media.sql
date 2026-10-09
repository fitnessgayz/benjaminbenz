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
  'Inner Chest Press',
  array[
    'Inner Chest Press Machine',
    'Machine Inner Chest Press',
    'Single-Arm Inner Chest Press',
    'PureStrength Inner Chest Press',
    'Pure Strength Inner Chest Press'
  ]::text[],
  'chest',
  array['triceps', 'shoulders']::text[],
  'machine',
  'beginner',
  'horizontal_push',
  3,
  '8-12 each',
  75,
  'horizontal_push',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-09/webp-768/inner-chest-press.webp',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/inner-chest-press.mp4',
  'Adjust the seat so the working-side handle lines up around mid-chest. Sit tall with your back supported, feet planted, and shoulder blade gently down and back. Grip the handle and press forward and inward along the machine path until the arm is nearly straight without rolling the shoulder forward. Pause and squeeze the chest, then return slowly to a comfortable stretch while keeping your torso against the pad. Complete both sides evenly.',
  true,
  true,
  156
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
  where lower(name) = lower('Inner Chest Press')
    and primary_muscle = 'chest'
    and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-09/webp-768/inner-chest-press.webp'
    and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/inner-chest-press.mp4';

  if matching_rows <> 1 then
    raise exception 'Expected exactly one mapped Inner Chest Press row, found %', matching_rows;
  end if;
end
$verify$;
