-- Link the fourth set of ten independently reviewed exercise cards.
with cards(name, slug) as (
  values
  ('incline dumbbell row', 'incline-dumbbell-row'),
  ('Incline chest press', 'incline-chest-press'),
  ('Incline bench press', 'incline-bench-press'),
  ('Cable Row', 'cable-row'),
  ('Shoulder Press', 'shoulder-press'),
  ('Incline Dumbbell Row — Wide Overhand Grip', 'incline-dumbbell-row-wide-overhand-grip'),
  ('DB Shoulder Press', 'db-shoulder-press'),
  ('Row Machine', 'row-machine'),
  ('Side chest press machine', 'side-chest-press-machine-v2'),
  ('Flat Bench Chest', 'flat-bench-chest')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;
