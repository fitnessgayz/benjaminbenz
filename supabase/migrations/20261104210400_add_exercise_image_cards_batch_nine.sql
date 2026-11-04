-- Link the ninth set of ten independently reviewed exercise cards.
with cards(name, slug) as (
  values
  ('Assisted Nordic Ham', 'assisted-nordic-ham'),
  ('banded glute kickback - bench', 'banded-glute-kickback-bench'),
  ('banded hip thrust - feet elevated', 'banded-hip-thrust-feet-elevated'),
  ('BOSU crunch', 'bosu-crunch'),
  ('BOSU dumbbell bicep curls', 'bosu-dumbbell-bicep-curls'),
  ('Alternating Leg Lowers', 'alternating-leg-lowers'),
  ('Adductor Rock-Back', 'adductor-rock-back'),
  ('Adductor rock-back with rotation', 'adductor-rock-back-with-rotation'),
  ('Ankle knee-to-wall rocks', 'ankle-knee-to-wall-rocks'),
  ('Ankle Rocks', 'ankle-rocks')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;
