-- Link ten visually reviewed start/end exercise cards after their storage upload.
with cards(name, slug) as (
  values
  ('Ab Crunch Machine', 'ab-crunch-machine'),
  ('Bicycle Crunch', 'bicycle-crunch-v2'),
  ('Cable Triceps Pushdown', 'cable-triceps-pushdown'),
  ('Crunches', 'crunches'),
  ('Decline Chest Press Machine', 'decline-chest-press-machine'),
  ('Dumbbell Shrug', 'dumbbell-shrug'),
  ('High-Row Machine', 'high-row-machine'),
  ('Neutral-Grip Machine Row', 'neutral-grip-machine-row'),
  ('Reverse Pec Deck', 'reverse-pec-deck'),
  ('Wide-Grip Lat Pulldown', 'wide-grip-lat-pulldown-v2')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active
  and exercise.is_approved
  and exercise.image_url is null;
