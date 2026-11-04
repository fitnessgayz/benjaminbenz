-- Link reviewed exercise image cards: 20261104222911_add_exercise_image_cards_batch_fifteen.sql.
with cards(name, slug) as (
  values
  ('Modified Push-Up', 'modified-push-up'),
  ('Narrow grip lat pull down', 'narrow-grip-lat-pull-down'),
  ('One Arm Cable curl - cross body', 'one-arm-cable-curl-cross-body'),
  ('One arm Incline cable curl', 'one-arm-incline-cable-curl'),
  ('One arm incline chest machine (side saddle)', 'one-arm-incline-chest-machine-side-saddle'),
  ('Plyometric Push-Up', 'plyometric-push-up'),
  ('Pike Push-Up', 'pike-push-up'),
  ('Plank Shoulder Tap', 'plank-shoulder-tap'),
  ('Plank Twists', 'plank-twists'),
  ('Plank Walkup', 'plank-walkup')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Incline Machine Chest Press - single arm side saddle', 'One arm incline chest machine (side saddle)')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

