-- Link reviewed exercise image cards: 20261104215002_add_exercise_image_cards_batch_twelve.sql.
with cards(name, slug) as (
  values
  ('Decline Push-Up', 'decline-push-up'),
  ('Decline Sit-Up', 'decline-sit-up'),
  ('Elevated floor bridge', 'elevated-floor-bridge'),
  ('Elevated Heel Cable Goblet squat', 'elevated-heel-cable-goblet-squat'),
  ('Elliptical Intervals', 'elliptical-intervals'),
  ('Hamstring Stretch', 'hamstring-stretch'),
  ('hanging leg straight', 'hanging-leg-straight'),
  ('Heavy seated calf / soleus raise', 'heavy-seated-calf-soleus-raise'),
  ('High-and-Wide Leg Press', 'high-and-wide-leg-press'),
  ('Glute Squat Machine RDL', 'glute-squat-machine-rdl')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

