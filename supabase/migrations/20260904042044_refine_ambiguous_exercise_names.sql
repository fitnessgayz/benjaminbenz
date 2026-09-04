-- Add the equipment/position-specific exercises that clients need to choose
-- explicitly instead of collapsing them into a different movement.
insert into public.exercise_library
  (name, aliases, primary_muscle, equipment, difficulty, movement_pattern,
   default_sets, default_reps, default_rest_seconds, substitution_group, sort_order)
values
  ('Dumbbell Chest Fly', array['DB Chest Fly', 'Dumbell chest flies'],
   'chest', 'dumbbell', 'beginner', 'chest_fly', 3, '10-15', 60, 'chest_fly', 61),
  ('Pec Deck Chest Fly', array['Pec Deck Machine', 'Chest fly machine'],
   'chest', 'machine', 'beginner', 'chest_fly', 3, '10-15', 60, 'chest_fly', 62),
  ('Dumbbell Reverse Fly', array['DB Reverse Fly'],
   'shoulders', 'dumbbell', 'beginner', 'rear_delt_fly', 3, '12-15', 60, 'rear_delt', 181),
  ('Standing Dumbbell Shoulder Press', array['Standing DB Shoulder Press'],
   'shoulders', 'dumbbell', 'intermediate', 'vertical_press', 3, '8-12', 90, 'vertical_press', 201),
  ('Lying Leg Raise', array['Leg Lift', 'Leg lifts', 'Body leg lifts'],
   'core', 'bodyweight', 'beginner', 'hip_flexion', 3, '10-15', 60, 'core_flexion', 651)
on conflict do nothing;

-- Keep the seated and standing shoulder presses as separate choices. A generic
-- "DB Shoulder Press" search intentionally matches both names rather than
-- silently choosing a position for the client.
update public.exercise_library
set aliases = coalesce((
      select array_agg(clean_alias order by lower(clean_alias))
      from (
        select distinct btrim(alias_value) as clean_alias
        from unnest(aliases || array['Seated DB Shoulder Press']) as alias_value
        where lower(btrim(alias_value)) not in ('db shoulder press', 'shoulder press')
      ) as cleaned_aliases
    ), '{}'::text[]),
    updated_at = now()
where lower(name) = lower('Seated Dumbbell Shoulder Press');

-- Remove aliases that used to point a dumbbell or pec-deck movement at the
-- generic machine reverse fly.
update public.exercise_library
set aliases = coalesce((
      select array_agg(clean_alias order by lower(clean_alias))
      from (
        select distinct btrim(alias_value) as clean_alias
        from unnest(aliases || array['Reverse flies', 'Reverse fly machine']) as alias_value
        where lower(btrim(alias_value)) not in ('dumbbell reverse fly', 'db reverse fly', 'pec deck machine')
      ) as cleaned_aliases
    ), '{}'::text[]),
    updated_at = now()
where lower(name) = lower('Reverse Fly');

-- Cable, dumbbell, and pec-deck chest fly variations remain distinct.
update public.exercise_library
set aliases = coalesce((
      select array_agg(clean_alias order by lower(clean_alias))
      from (
        select distinct btrim(alias_value) as clean_alias
        from unnest(aliases || array['Cable chest fly machine']) as alias_value
        where lower(btrim(alias_value)) not in
          ('db chest fly', 'dumbbell chest fly', 'dumbell chest flies', 'pec deck machine', 'chest fly machine')
      ) as cleaned_aliases
    ), '{}'::text[]),
    updated_at = now()
where lower(name) = lower('Cable Chest Fly');

-- "Leg Lift" means a lying leg raise, not a hanging knee raise.
update public.exercise_library
set aliases = coalesce((
      select array_agg(clean_alias order by lower(clean_alias))
      from (
        select distinct btrim(alias_value) as clean_alias
        from unnest(aliases) as alias_value
        where lower(btrim(alias_value)) not in ('leg lift', 'leg lifts', 'body leg lifts')
      ) as cleaned_aliases
    ), '{}'::text[]),
    updated_at = now()
where lower(name) = lower('Hanging Knee Raise');

-- Preserve the clarified shorthand as aliases on the intended movements.
update public.exercise_library
set aliases = case lower(name)
      when lower('Barbell Bench Press') then
        (select array_agg(distinct alias_value order by alias_value)
         from unnest(aliases || array['Bench Press']) as alias_value)
      when lower('Dumbbell Curl') then
        (select array_agg(distinct alias_value order by alias_value)
         from unnest(aliases || array['Bicep Curl', 'Bicep Curls']) as alias_value)
      when lower('Cable Glute Kickback') then
        (select array_agg(distinct alias_value order by alias_value)
         from unnest(aliases || array['Kickback']) as alias_value)
      when lower('Rope Triceps Pressdown') then
        (select array_agg(distinct alias_value order by alias_value)
         from unnest(aliases || array['Triceps Pushdown']) as alias_value)
      when lower('Dumbbell Lateral Raise') then
        (select array_agg(distinct alias_value order by alias_value)
         from unnest(aliases || array['FB Lateral Raise']) as alias_value)
      else aliases
    end,
    updated_at = now()
where lower(name) in (
  lower('Barbell Bench Press'),
  lower('Dumbbell Curl'),
  lower('Cable Glute Kickback'),
  lower('Rope Triceps Pressdown'),
  lower('Dumbbell Lateral Raise')
);

-- Rename the clarified history rows in place. The original label remains in
-- original_exercise_name, so no real workout log is deleted or recreated.
with exercise_name_map(alias, canonical_name) as (
  values
    ('Bench Press', 'Barbell Bench Press'),
    ('Bicep Curl', 'Dumbbell Curl'),
    ('Bicep Curls', 'Dumbbell Curl'),
    ('DB Reverse Fly', 'Dumbbell Reverse Fly'),
    ('Dumbbell Reverse Fly', 'Dumbbell Reverse Fly'),
    ('DB Chest Fly', 'Dumbbell Chest Fly'),
    ('Dumbell Chest Flies', 'Dumbbell Chest Fly'),
    ('Pec Deck Machine', 'Pec Deck Chest Fly'),
    ('Leg Lift', 'Lying Leg Raise'),
    ('Leg Lifts', 'Lying Leg Raise'),
    ('Body Leg Lifts', 'Lying Leg Raise'),
    ('Kickback', 'Cable Glute Kickback'),
    ('Triceps Pushdown', 'Rope Triceps Pressdown'),
    ('FB Lateral Raise', 'Dumbbell Lateral Raise')
), deduplicated_map as (
  select distinct on (lower(btrim(alias))) alias, canonical_name
  from exercise_name_map
  order by lower(btrim(alias)), canonical_name
)
update public.client_workout_logs as workout_log
set
  original_exercise_name = coalesce(workout_log.original_exercise_name, workout_log.exercise_name),
  exercise_name = name_map.canonical_name
from deduplicated_map as name_map
where lower(btrim(workout_log.exercise_name)) = lower(btrim(name_map.alias))
  and workout_log.exercise_name is distinct from name_map.canonical_name;
