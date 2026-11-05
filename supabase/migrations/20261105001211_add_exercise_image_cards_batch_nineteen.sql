-- Link reviewed exercise image cards: 20261105001211_add_exercise_image_cards_batch_nineteen.sql.
-- Normalize a library title's spacing while preserving prior search and workout history.
update public.exercise_library
set name = 'Arm Blaster Dumbbell Curls',
    aliases = case when 'arm  blaster dumbbell curls' = any(aliases) then aliases else array_append(aliases, 'arm  blaster dumbbell curls') end,
    updated_at = now()
where id = '0f800226-0fd0-416c-b550-8a4a756fa66c'
  and name = 'arm  blaster dumbbell curls'
  and is_active and is_approved;

update public.client_workout_logs
set original_exercise_name = coalesce(original_exercise_name, exercise_name),
    exercise_name = 'Arm Blaster Dumbbell Curls'
where exercise_name = 'arm  blaster dumbbell curls';

with cards(name, slug) as (
  values
  ('Incline Treadmill Walk', 'incline-treadmill-walk'),
  ('stationary bike', 'stationary-bike'),
  ('Easy Treadmill Run or Brisk Walk', 'easy-treadmill-run-or-brisk-walk'),
  ('Torso rotation machine', 'torso-rotation-machine'),
  ('V squat machine - hip hinge', 'v-squat-machine-hip-hinge'),
  ('Wall Lat Stretch with Side Bend', 'wall-lat-stretch-with-side-bend'),
  ('Arm Blaster Dumbbell Curls', 'arm-blaster-dumbbell-curls'),
  ('Bench Prayer Lat Stretch', 'bench-prayer-lat-stretch'),
  ('Child’s Pose with Side Reach', 'childs-pose-with-side-reach'),
  ('Couch Stretch', 'couch-stretch')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

