-- Link reviewed exercise image cards: 20261105034211_add_exercise_image_cards_batch_twenty_five.sql.
with cards(name, slug) as (
  values
  ('ball crunchies', 'ball-crunchies'),
  ('decline cable press flies', 'decline-cable-press-flies'),
  ('Outer thigh', 'outer-thigh'),
  ('Tricep rope pull', 'tricep-rope-pull')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Arm Blaster', 'Arm Blaster Dumbbell Curls'),
  ('Chest Pres', 'Machine Chest Press'),
  ('Hack Squat / Bulgarian', 'Linear Hack Squat'),
  ('Incline Chest', 'Incline chest press'),
  ('Incline press', 'Incline chest press'),
  ('overhead tricept', 'Overhead Dumbbell Triceps Extension'),
  ('Single arm row', 'Single-Arm Cable Row'),
  ('Tricep ext', 'Overhead Dumbbell Triceps Extension'),
  ('tricep push', 'Cable Triceps Pushdown')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

