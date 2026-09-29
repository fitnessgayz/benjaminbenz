-- Publish the completed 768px cards for the four squat variations from batch
-- 10. The original batch migration used the then-available 480px cards; this
-- keeps the distinct equipment variations separate while promoting each
-- canonical exercise to its matching larger asset.
with squat_media as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {"name":"Heel-Elevated Goblet Squat","aliases":["Heel Elevated Goblet Squat","Heels Elevated Goblet Squat"],"primary_muscle":"quads","equipment":"dumbbell","default_reps":"8-12","default_rest_seconds":90,"sort_order":401,"slug":"heel-elevated-goblet-squat"},
    {"name":"Heel-Elevated Barbell Squat","aliases":["Heel Elevated Barbell Squat","Heels Elevated Barbell Squat"],"primary_muscle":"quads","equipment":"barbell","default_reps":"6-10","default_rest_seconds":120,"sort_order":402,"slug":"heel-elevated-barbell-squat"},
    {"name":"Barbell Front Squat","aliases":["Barbell Front-Squat"],"primary_muscle":"quads","equipment":"barbell","default_reps":"6-10","default_rest_seconds":120,"sort_order":403,"slug":"barbell-front-squat"},
    {"name":"Dumbbell Front Squat","aliases":["Dumbbell Front-Squat","DB Front Squat"],"primary_muscle":"quads","equipment":"dumbbell","default_reps":"8-12","default_rest_seconds":90,"sort_order":404,"slug":"dumbbell-front-squat"}
  ]$exercises$::jsonb) as exercise(
    name text,
    aliases text[],
    primary_muscle text,
    equipment text,
    default_reps text,
    default_rest_seconds integer,
    sort_order integer,
    slug text
  )
)
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
  is_approved,
  is_active,
  sort_order
)
select
  name,
  aliases,
  primary_muscle,
  equipment,
  'intermediate',
  'squat',
  3,
  default_reps,
  default_rest_seconds,
  'squat',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/' || slug || '.webp',
  true,
  true,
  sort_order
from squat_media
on conflict (lower(name)) do update set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(coalesce(public.exercise_library.aliases, '{}') || excluded.aliases) as alias
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
  is_approved = true,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();
