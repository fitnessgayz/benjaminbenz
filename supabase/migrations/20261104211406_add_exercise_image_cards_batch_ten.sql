-- Link the tenth set of ten independently reviewed exercise cards.
with cards(name, slug) as (
  values
  ('Barbell Deadlift', 'barbell-deadlift'),
  ('Barbell Hip Thrust', 'barbell-hip-thrust'),
  ('Barbell Romanian Deadlift', 'barbell-romanian-deadlift'),
  ('Close-Grip Barbell Bench Press', 'close-grip-barbell-bench-press'),
  ('Cable Shoulder Press', 'cable-shoulder-press'),
  ('Cable Chest press', 'cable-chest-press'),
  ('Cable Crossover', 'cable-crossover'),
  ('Calf Stretch', 'calf-stretch'),
  ('Barbell Curl — arm blaster', 'barbell-curl-arm-blaster'),
  ('Archer Push-Up', 'archer-push-up')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;
