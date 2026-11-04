-- Link the third set of ten visually reviewed exercise cards and two exact name variants.
with cards(name, slug) as (
  values
  ('Tuck Jump', 'tuck-jump'),
  ('Chest dips', 'chest-dips'),
  ('Cable Curl (single arm)', 'cable-curl-single-arm'),
  ('High to low cable row', 'high-to-low-cable-row'),
  ('Lunges', 'lunges'),
  ('Incline Cable Curl', 'incline-cable-curl'),
  ('Two-Arm Dumbbell Chest Press with Band', 'two-arm-dumbbell-chest-press-with-band'),
  ('Hollow Hold Leg Extensions', 'hollow-hold-leg-extensions'),
  ('Banded Lateral Walk', 'banded-lateral-walk'),
  ('Cable Chest Fly single arm', 'cable-chest-fly-single-arm')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Abcoaster', 'Ab Coaster'),
  ('Half-Kneeling Cable Wood Chop', 'Half-Kneeling Cable Woodchop')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;
