-- Link ten independently reviewed cards, including the corrected dual-cable reach card.
with cards(name, slug) as (
  values
  ('Assisted Chest-Focused Dip', 'assisted-chest-focused-dip'),
  ('Back Extension (Glute Focus) Machine', 'back-extension-glute-focus-machine'),
  ('Cable Tricep Kickback', 'cable-tricep-kickback'),
  ('Chest-Supported Row', 'chest-supported-row'),
  ('Dumbbell Push Press', 'dumbbell-push-press'),
  ('Incline Dumbbell Row - Overhand Grip', 'incline-dumbbell-row-overhand-grip'),
  ('Kettlebell Romanian Deadlift', 'kettlebell-romanian-deadlift'),
  ('Lat pull down wide neutral grip', 'lat-pull-down-wide-neutral-grip'),
  ('straight leg situps', 'straight-leg-situps'),
  ('Cable Chest Press with Reach', 'cable-chest-press-with-reach-v4')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from public.exercise_library as source
where target.name = 'Incline DB overhand row'
  and source.name = 'Incline Dumbbell Row - Overhand Grip'
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;
