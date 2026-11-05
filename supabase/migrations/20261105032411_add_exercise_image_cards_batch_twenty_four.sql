-- Link reviewed exercise image cards: 20261105032411_add_exercise_image_cards_batch_twenty_four.sql.
with cards(name, slug) as (
  values
  ('Assisted pull-up or lat pulldown', 'assisted-pull-up-or-lat-pulldown-v2'),
  ('Biking from caltrain', 'biking-from-caltrain-v2'),
  ('Deadlift glute builder', 'deadlift-glute-builder-v2'),
  ('Easy Bike or Brisk Walk', 'easy-bike-or-brisk-walk-v2'),
  ('Frontal Raise', 'frontal-raise'),
  ('Seated Neutral Grip Row', 'seated-neutral-grip-row'),
  ('Seated row overhand wide grip', 'seated-row-overhand-wide-grip'),
  ('Side bend', 'side-bend'),
  ('Single Arm Triceps Ext', 'single-arm-triceps-ext'),
  ('V-squat', 'v-squat')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Jesus Bicep Curl', 'Jesus Christ Curl'),
  ('Pex Fly', 'Pec Deck Chest Fly'),
  ('Cross over cable back', 'Rear-Delt Cable Fly'),
  ('Cardio bike', 'stationary bike'),
  ('Incline Row (Overhand Grip)', 'Incline Dumbbell Row - Overhand Grip')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

