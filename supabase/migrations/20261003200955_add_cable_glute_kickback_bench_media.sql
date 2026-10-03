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
  'Cable Glute Kickback (Bench)',
  array[
    'Bench Cable Glute Kickback',
    'Bench-Supported Cable Glute Kickback',
    'Cable Kickback on Bench',
    'Cable Kickback — Incline Bench',
    'Incline Bench Cable Glute Kickback'
  ],
  'glutes',
  array['hamstrings'],
  'cable',
  'beginner',
  'hip_extension',
  3,
  '12-15 each',
  60,
  'hip_extension',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-03/webp-768/cable-glute-kickback-bench.webp',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-03/cable-glute-kickback-bench.mp4',
  'Kneel on the bench with the supporting knee and hands secure. Attach the low cable to the working ankle, brace your trunk, and keep your hips square. Drive the working leg back by extending the hip without arching the lower back or rotating the pelvis. Pause briefly at full glute contraction, then return under control until the hip is flexed and repeat before switching sides.',
  true,
  true,
  525
)
on conflict (lower(name)) do update set
  aliases = array(
    select distinct alias
    from unnest(public.exercise_library.aliases || excluded.aliases) as alias
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
  sort_order = excluded.sort_order,
  updated_at = now();

-- Older workout templates were consolidated to the general exercise name.
-- Give those records the reviewed bench-supported media as well so existing
-- programmed workouts open the same card and video without being rewritten.
update public.exercise_library
set
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-03/webp-768/cable-glute-kickback-bench.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-03/cable-glute-kickback-bench.mp4',
  updated_at = now()
where lower(name) = lower('Cable Glute Kickback');
