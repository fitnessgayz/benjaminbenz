-- Link reviewed exercise image cards: 20261104234111_add_exercise_image_cards_batch_eighteen.sql.
with cards(name, slug) as (
  values
  ('Stationary Bike Intervals', 'stationary-bike-intervals'),
  ('Incline Treadmill Intervals', 'incline-treadmill-intervals'),
  ('Stairs', 'stairs'),
  ('Stability Ball Russian Twist', 'stability-ball-russian-twist'),
  ('Standing Tubing Row', 'standing-tubing-row'),
  ('Single-Leg Balance Reach: Frontal Plane', 'single-leg-balance-reach-frontal-plane'),
  ('Single-leg bent-knee calf raise', 'single-leg-bent-knee-calf-raise'),
  ('Pec Foam Roll Against Wall', 'pec-foam-roll-against-wall'),
  ('Cool Down Walk', 'cool-down-walk'),
  ('Easy Run Warm-Up', 'easy-run-warm-up')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

