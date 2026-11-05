-- Link reviewed exercise image cards: 20261105015311_add_exercise_image_cards_batch_twenty_two.sql.
with cards(name, slug) as (
  values
  ('Single arm cable chest press (side)', 'single-arm-cable-chest-press-side-v3'),
  ('Single arm row machine — overhand', 'single-arm-row-machine-overhand'),
  ('Straight-Arm Plank', 'straight-arm-plank'),
  ('Sumo squats (kettlebell)', 'sumo-squats-kettlebell'),
  ('Trx overhand row', 'trx-overhand-row'),
  ('Iron Cross', 'iron-cross'),
  ('Supported hip airplane', 'supported-hip-airplane'),
  ('Thoracic Spine Foam Roll', 'thoracic-spine-foam-roll'),
  ('Table top crunches', 'table-top-crunches'),
  ('medicine ball Russian twist', 'medicine-ball-russian-twist')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Standing single leg curl', 'Standing Leg Curl')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

