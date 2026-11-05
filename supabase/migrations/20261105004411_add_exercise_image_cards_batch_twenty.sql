-- Link reviewed exercise image cards: 20261105004411_add_exercise_image_cards_batch_twenty.sql.
with cards(name, slug) as (
  values
  ('Figure-Four Glute Stretch', 'figure-four-glute-stretch'),
  ('Floor Bridge', 'floor-bridge'),
  ('Floor Prone Cobra', 'floor-prone-cobra'),
  ('Glute and Hamstring Foam Roll', 'glute-and-hamstring-foam-roll'),
  ('Glute Bridge with Pause', 'glute-bridge-with-pause'),
  ('Good Mornings', 'good-mornings'),
  ('Assisted or Weighted Dip', 'assisted-or-weighted-dip'),
  ('Hip Adduction', 'hip-adduction'),
  ('Leg Swings', 'leg-swings'),
  ('Supine Breathing with Feet Elevated', 'supine-breathing-feet-elevated')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Weighted Dip or Assisted Dip', 'Assisted or Weighted Dip')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

