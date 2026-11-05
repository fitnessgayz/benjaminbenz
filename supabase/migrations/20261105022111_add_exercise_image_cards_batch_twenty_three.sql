-- Link reviewed exercise image cards: 20261105022111_add_exercise_image_cards_batch_twenty_three.sql.
-- Normalize library display names while preserving old names for search and workout history.
update public.exercise_library
set name = 'Dumbbell Rows',
    aliases = case when 'Dumbell rows' = any(aliases) then aliases else array_append(aliases, 'Dumbell rows') end,
    updated_at = now()
where id = '94793ed8-ee41-4af3-9d5c-0b03c74f5c1e'
  and name = 'Dumbell rows'
  and is_active and is_approved;

update public.client_workout_logs
set original_exercise_name = coalesce(original_exercise_name, exercise_name),
    exercise_name = 'Dumbbell Rows'
where exercise_name = 'Dumbell rows';

update public.exercise_library
set name = 'Row Machine - Overhand Grip',
    aliases = case when 'row machine  - overhand grip' = any(aliases) then aliases else array_append(aliases, 'row machine  - overhand grip') end,
    updated_at = now()
where id = '16bd4662-8fc5-4917-b059-549526d9bff4'
  and name = 'row machine  - overhand grip'
  and is_active and is_approved;

update public.client_workout_logs
set original_exercise_name = coalesce(original_exercise_name, exercise_name),
    exercise_name = 'Row Machine - Overhand Grip'
where exercise_name = 'row machine  - overhand grip';

update public.exercise_library
set name = 'Seated Row Machine (Overhand Grip)',
    aliases = case when 'Seated Row Machine (overgand Grip)' = any(aliases) then aliases else array_append(aliases, 'Seated Row Machine (overgand Grip)') end,
    updated_at = now()
where id = 'd8add9ce-c2eb-471c-8653-93221f988123'
  and name = 'Seated Row Machine (overgand Grip)'
  and is_active and is_approved;

update public.client_workout_logs
set original_exercise_name = coalesce(original_exercise_name, exercise_name),
    exercise_name = 'Seated Row Machine (Overhand Grip)'
where exercise_name = 'Seated Row Machine (overgand Grip)';

with cards(name, slug) as (
  values
  ('Wide-Grip Assisted Pull-Up', 'wide-grip-assisted-pull-up-v2'),
  ('Hammer Curl (cable)', 'hammer-curl-cable'),
  ('Bulgarian Split Squat — machine', 'bulgarian-split-squat-machine'),
  ('single leg rdl', 'single-leg-rdl'),
  ('Kickback -  leg extension machine', 'kickback-leg-extension-machine'),
  ('Dumbbell Rows', 'dumbell-rows'),
  ('Row Machine - Overhand Grip', 'row-machine-overhand-grip'),
  ('Seated Row Machine (Overhand Grip)', 'seated-row-machine-overhand-grip'),
  ('EZ-bar or dumbbell curl', 'ez-bar-or-dumbbell-curl'),
  ('Belt Squat RDL', 'belt-squat-rdl')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

