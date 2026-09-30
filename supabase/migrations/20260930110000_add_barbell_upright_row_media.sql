-- Publish the approved branded card and user-provided movement demo for the
-- barbell upright row. Existing YouTube references remain untouched so the
-- first-party video supplements, rather than replaces, the external reference.
insert into public.exercise_library (
  name,
  aliases,
  primary_muscle,
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
  'Barbell Upright Row',
  array['Upright Row', 'Upright Barbell Row', 'EZ-Bar Upright Row', 'EZ Bar Upright Row'],
  'shoulders',
  'barbell',
  'intermediate',
  'vertical_pull',
  3,
  '8-12',
  75,
  'upright_row',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/barbell-upright-row.webp',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/barbell-upright-row.mp4',
  'Stand tall with the bar close to your body. Lead with your elbows as you pull toward your upper chest, keep your shoulders down, then lower the bar slowly with control.',
  true,
  true,
  225
)
on conflict (lower(name)) do update set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(coalesce(public.exercise_library.aliases, '{}'::text[]) || excluded.aliases) as alias
  ),
  primary_muscle = excluded.primary_muscle,
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
