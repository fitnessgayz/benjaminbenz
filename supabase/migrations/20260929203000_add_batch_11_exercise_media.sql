-- Add the approved squat-machine cards from branded-card batch 11. The
-- corrected Dual 45-degree card belongs to the existing back-extension entry,
-- so that exercise is updated instead of creating a duplicate canonical row.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {"name":"Belt Squat","aliases":["Belt Squat Machine","Machine Belt Squat"],"primary_muscle":"quads","secondary_muscles":["glutes"],"equipment":"machine","movement_pattern":"squat","default_reps":"8-12","default_rest_seconds":90,"substitution_group":"squat","sort_order":405,"slug":"belt-squat"},
    {"name":"Pendulum Squat Machine","aliases":["Pendulum Squat","Machine Pendulum Squat"],"primary_muscle":"quads","secondary_muscles":["glutes"],"equipment":"machine","movement_pattern":"squat","default_reps":"8-12","default_rest_seconds":120,"substitution_group":"squat","sort_order":406,"slug":"pendulum-squat-machine"},
    {"name":"Glute Squat Machine","aliases":["Glute Squat","Machine Glute Squat","GluteBuilder Glute Squat","Precor Glute Squat"],"primary_muscle":"glutes","secondary_muscles":["quads"],"equipment":"machine","movement_pattern":"squat","default_reps":"8-12","default_rest_seconds":90,"substitution_group":"squat","sort_order":407,"slug":"glute-squat-machine"}
  ]$exercises$::jsonb) as exercise(
    name text,
    aliases text[],
    primary_muscle text,
    secondary_muscles text[],
    equipment text,
    movement_pattern text,
    default_reps text,
    default_rest_seconds integer,
    substitution_group text,
    sort_order integer,
    slug text
  )
)
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
  is_approved,
  is_active,
  sort_order
)
select
  name,
  aliases,
  primary_muscle,
  secondary_muscles,
  equipment,
  'intermediate',
  movement_pattern,
  3,
  default_reps,
  default_rest_seconds,
  substitution_group,
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/' || slug || '.webp',
  true,
  true,
  sort_order
from new_exercises
on conflict (lower(name)) do update set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(coalesce(public.exercise_library.aliases, '{}') || excluded.aliases) as alias
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
  is_approved = true,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

update public.exercise_library
set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(
      coalesce(aliases, '{}') || array[
        '45 Degree Back Extension',
        '45 Degree Hip Extension',
        '45-Degree Hip Extension',
        '45° Hip Extension',
        'Dual 45 Degree Hip Extension',
        'Dual 45-Degree Hip Extension',
        'Dual 45° Hip Extension'
      ]
    ) as alias
  ),
  equipment = 'machine',
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dual-45-hip-extension.webp',
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('45-Degree Back Extension');
