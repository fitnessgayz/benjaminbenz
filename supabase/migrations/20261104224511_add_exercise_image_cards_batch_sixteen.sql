-- Link reviewed exercise image cards: 20261104224511_add_exercise_image_cards_batch_sixteen.sql.
with cards(name, slug) as (
  values
  ('Prisoner Squat', 'prisoner-squat'),
  ('Pull-Up or Assisted Pull-Up', 'pull-up-or-assisted-pull-up'),
  ('rear delt dumbbell swings', 'rear-delt-dumbbell-swings'),
  ('RKC Plank', 'rkc-plank'),
  ('Short-lever Copenhagen plank', 'short-lever-copenhagen-plank'),
  ('Side oblique crunch', 'side-oblique-crunch'),
  ('Single leg extension', 'single-leg-extension'),
  ('Single Leg Kettlebell RDL', 'single-leg-kettlebell-rdl'),
  ('Single-Leg Seated Leg Curl', 'single-leg-seated-leg-curl'),
  ('Single-Leg Squat', 'single-leg-squat')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

