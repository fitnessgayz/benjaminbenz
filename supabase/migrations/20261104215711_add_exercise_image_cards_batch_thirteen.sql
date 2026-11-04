-- Link reviewed exercise image cards: 20261104215711_add_exercise_image_cards_batch_thirteen.sql.
with cards(name, slug) as (
  values
  ('Incline Push-Up', 'incline-push-up'),
  ('Inverted Push-Up', 'inverted-push-up'),
  ('jack knife', 'jack-knife'),
  ('Kettlebell Deadlift', 'kettlebell-deadlift'),
  ('Kettlebell Front Squat', 'kettlebell-front-squat'),
  ('Kettlebell Crush Curl with Squat', 'kettlebell-crush-curl-with-squat'),
  ('Kneeling Lat Stretch', 'kneeling-lat-stretch'),
  ('Kneeling wood-chop', 'kneeling-wood-chop'),
  ('Lateral lunge with reach', 'lateral-lunge-with-reach'),
  ('Lateral pogo hops', 'lateral-pogo-hops')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

