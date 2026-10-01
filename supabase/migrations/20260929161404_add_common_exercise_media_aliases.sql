-- Let the same approved exercise artwork resolve from common spelling and
-- word-order variants. Keep equipment, angle, stance, and posture specific:
-- generic labels such as "Shoulder Press", "Row Machine", and "Incline Chest
-- Press" intentionally remain unmapped because they can describe multiple
-- distinct exercises in this library.
with alias_map (canonical_name, alias) as (
  values
    ('Barbell Bench Press', 'Flat Barbell Bench Press'),
    ('Barbell Bench Press', 'Barbell Flat Bench Press'),
    ('Dumbbell Bench Press', 'DB Bench Press'),
    ('Dumbbell Bench Press', 'Flat DB Bench Press'),
    ('Dumbbell Bench Press', 'Flat Dumbbell Bench Press'),
    ('Dumbbell Bench Press', 'Dumbbell Flat Bench Press'),
    ('Dumbbell Bench Press', 'Flat Dumbbell Chest Press'),
    ('Hack Squat', 'Hack Squat Machine'),
    ('Hack Squat', 'Machine Hack Squat'),
    ('Dumbbell Reverse Fly', 'Reverse Dumbbell Fly'),
    ('Dumbbell Reverse Fly', 'Reverse Dumbbell Flys'),
    ('Dumbbell Reverse Fly', 'Reverse Dumbbell Flies'),
    ('Dumbbell Reverse Fly', 'Rear Delt Dumbbell Fly'),
    ('Dumbbell Reverse Fly', 'Rear-Delt Dumbbell Fly'),
    ('Pec Deck Chest Fly', 'Pec Deck Fly'),
    ('Pec Deck Chest Fly', 'Machine Chest Fly'),
    ('Pec Deck Chest Fly', 'Machine Pec Fly'),
    ('Lying Leg Raise', 'Lying Leg Lift'),
    ('Lying Leg Raise', 'Lying Leg Lifts'),
    ('Lying Leg Raise', 'Lying Down Leg Lift'),
    ('Lying Leg Raise', 'Lying Down Leg Lifts'),
    ('Plank', 'Forearm Plank')
), aliases_by_exercise as (
  select canonical_name, array_agg(alias order by lower(alias), alias) as aliases
  from alias_map
  group by canonical_name
)
update public.exercise_library as exercise
set
  aliases = (
    select array_agg(clean_alias order by lower(clean_alias), clean_alias)
    from (
      select distinct on (lower(btrim(alias_value))) btrim(alias_value) as clean_alias
      from unnest(coalesce(exercise.aliases, '{}'::text[]) || mapped.aliases) as alias_value
      where btrim(alias_value) <> ''
      order by lower(btrim(alias_value)), btrim(alias_value)
    ) as deduplicated_aliases
  ),
  updated_at = now()
from aliases_by_exercise as mapped
where lower(exercise.name) = lower(mapped.canonical_name)
  and exercise.is_active
  and exercise.is_approved;
