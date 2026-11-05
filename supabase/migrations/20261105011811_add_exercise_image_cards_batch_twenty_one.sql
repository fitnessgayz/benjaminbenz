-- Link reviewed exercise image cards: 20261105011811_add_exercise_image_cards_batch_twenty_one.sql.
with cards(name, slug) as (
  values
  ('Tricep Dip Machine Single Arm', 'tricep-dip-machine-single-arm'),
  ('Bent-knee ankle rocks', 'bent-knee-ankle-rocks'),
  ('Supine Hamstring Stretch with Strap', 'supine-hamstring-stretch-with-strap'),
  ('Half-Kneeling Ankle Rock', 'half-kneeling-ankle-rock-v2'),
  ('Glute-Biased Single-Leg Press', 'glute-biased-single-leg-press'),
  ('Incline Neutral-Grip Dumbbell Curl', 'incline-neutral-grip-dumbbell-curl'),
  ('Leg Press Calf Raise', 'leg-press-calf-raise'),
  ('Tricep Pushdown - Dual Pulley', 'tricep-pushdown-dual-pulley'),
  ('Hip Flexor Stretch', 'hip-flexor-stretch-v3'),
  ('Reverse Crunch to Knee-Up with Rotation', 'reverse-crunch-to-knee-up-with-rotation-v3')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Single arm a dip machine', 'Tricep Dip Machine Single Arm')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

