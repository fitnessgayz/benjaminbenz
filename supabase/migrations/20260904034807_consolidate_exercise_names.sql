-- Preserve the first saved label on every renamed row so the consolidation is
-- reversible without deleting or recreating any workout-history records.
alter table public.client_workout_logs
add column if not exists original_exercise_name text;

comment on column public.client_workout_logs.original_exercise_name is
  'The client-entered exercise label before its first canonical-name consolidation.';

with exercise_name_map(alias, canonical_name) as (
  values
    ('45 Degree Back Extension - Glute Focus', '45-Degree Back Extension'),
    ('Back Extension (Glute Focus)', '45-Degree Back Extension'),
    ('Back Extension Glute Focus', '45-Degree Back Extension'),
    ('Asst Pullup', 'Assisted Pull-Up'),
    ('Barbell bicep curl', 'Barbell Curl'),
    ('BB Bicep Curl', 'Barbell Curl'),
    ('BB Curl', 'Barbell Curl'),
    ('Bench dips', 'Bench Dip'),
    ('ab cable crunch on knee pad', 'Cable Crunch'),
    ('Cable Bicep Curl', 'Cable Curl'),
    ('Cable chest fly machine', 'Cable Chest Fly'),
    ('Cable kickback — incline bench', 'Cable Glute Kickback'),
    ('Cable Lateral Raise (lean 45 degrees)', 'Cable Lateral Raise'),
    ('Single Arm Cable Lateral Raise', 'Cable Lateral Raise'),
    ('Cable Rope Triceps Pressdown', 'Rope Triceps Pressdown'),
    ('Chest Supported Dumbbell Row', 'Chest-Supported Dumbbell Row'),
    ('Close grip lat pull down', 'Close-Grip Lat Pulldown'),
    ('Closed grip lat pull down', 'Close-Grip Lat Pulldown'),
    ('Decline Cable chest fly', 'Decline Cable Fly'),
    ('decline cable flies', 'Decline Cable Fly'),
    ('DB chest press', 'Dumbbell Bench Press'),
    ('Dumbbell Chest Press', 'Dumbbell Bench Press'),
    ('Flat bench dumbbell press', 'Dumbbell Bench Press'),
    ('Flat dumbbell bench press', 'Dumbbell Bench Press'),
    ('Dumbell bench press', 'Dumbbell Bench Press'),
    ('DB Bicep Curl', 'Dumbbell Curl'),
    ('Dumbbell bicep curl', 'Dumbbell Curl'),
    ('Dumbell curl', 'Dumbbell Curl'),
    ('dumb bell icep Curl', 'Dumbbell Curl'),
    ('Db lateral raise', 'Dumbbell Lateral Raise'),
    ('DB lateral raise', 'Dumbbell Lateral Raise'),
    ('DB RDL', 'Dumbbell Romanian Deadlift'),
    ('Dumbbell RDL', 'Dumbbell Romanian Deadlift'),
    ('Hip Trust Machine', 'Hip Thrust Machine'),
    ('Machine Hip Thrust', 'Hip Thrust Machine'),
    ('Incline chest press machine', 'Incline Machine Chest Press'),
    ('Machine Incline Chest Press', 'Incline Machine Chest Press'),
    ('Incline DB chest press', 'Incline Dumbbell Press'),
    ('Incline dumbbell bench press', 'Incline Dumbbell Press'),
    ('Incline dumbbell chest', 'Incline Dumbbell Press'),
    ('Incline dumbbell chest press', 'Incline Dumbbell Press'),
    ('Dumbell incline press', 'Incline Dumbbell Press'),
    ('Super Incline DB Chest Press', 'Incline Dumbbell Press'),
    ('Lat Pull Down', 'Lat Pulldown'),
    ('Lat Pulldown Machine', 'Lat Pulldown'),
    ('Leg extensions', 'Leg Extension'),
    ('Chest press machine', 'Machine Chest Press'),
    ('Shoulder press machine', 'Machine Shoulder Press'),
    ('Machine preacher curl', 'Preacher Curl'),
    ('Preacher curl machine', 'Preacher Curl'),
    ('Pull up', 'Pull-Up'),
    ('Push up', 'Push-Up'),
    ('Push ups', 'Push-Up'),
    ('Reverse flies', 'Reverse Fly'),
    ('Reverse fly machine', 'Reverse Fly'),
    ('Seated cable rows', 'Seated Cable Row'),
    ('Cable seated row', 'Seated Cable Row'),
    ('Seated dip', 'Seated Dip Machine'),
    ('Seated hammer curl', 'Hammer Curl'),
    ('Single arm db row', 'One-Arm Dumbbell Row'),
    ('Single arm DB rows', 'One-Arm Dumbbell Row'),
    ('Single arm dumbbell row', 'One-Arm Dumbbell Row'),
    ('Single Arm Dumbbell Row', 'One-Arm Dumbbell Row'),
    ('Single arm Dumbell row', 'One-Arm Dumbbell Row'),
    ('Single-arm DB row', 'One-Arm Dumbbell Row'),
    ('Standing hamstring curl', 'Standing Leg Curl'),
    ('Side planks', 'Side Plank')
), expanded_map as (
  select alias, canonical_name from exercise_name_map
  union all
  select canonical_name, canonical_name from exercise_name_map
), deduplicated_map as (
  select distinct on (lower(btrim(alias))) alias, canonical_name
  from expanded_map
  order by lower(btrim(alias)), canonical_name
)
update public.client_workout_logs as workout_log
set
  original_exercise_name = coalesce(workout_log.original_exercise_name, workout_log.exercise_name),
  exercise_name = name_map.canonical_name
from deduplicated_map as name_map
where lower(btrim(workout_log.exercise_name)) = lower(btrim(name_map.alias))
  and workout_log.exercise_name is distinct from name_map.canonical_name;
