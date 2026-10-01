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
  'Heel-Elevated Kettlebell RDL',
  array[
    'Elevated Heel RDL',
    'Heel Elevated RDL',
    'Heel-Elevated Romanian Deadlift',
    'Elevated-Heel Kettlebell Romanian Deadlift',
    'Heel-Elevated Kettlebell Romanian Deadlift'
  ],
  'hamstrings',
  array['glutes', 'calves'],
  'other',
  'intermediate',
  'hinge',
  3,
  '8-12',
  90,
  'hinge',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-01/webp-768/heel-elevated-kettlebell-rdl.webp',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-01/heel-elevated-kettlebell-rdl.mp4',
  'Stand tall with your heels supported on the wedge and a kettlebell in each hand. Brace your trunk, keep a soft knee bend, and push your hips back while the kettlebells travel close to your legs. Lower only until you reach controlled hamstring tension, then drive your hips forward to return to standing without rounding your back.',
  true,
  true,
  452
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
  updated_at = now();
