-- Link ten independently reviewed exercise cards, including the corrected full shoulder pass-through.
with cards(name, slug) as (
  values
  ('Barbell Bench Press with Bands', 'barbell-bench-press-with-bands'),
  ('Barbell Bench Press with Chains', 'barbell-bench-press-with-chains'),
  ('Band Shoulder Pass-Through', 'band-shoulder-pass-through-v2'),
  ('BOSU dumbbell chest press', 'bosu-dumbbell-chest-press'),
  ('Bird Dog', 'bird-dog'),
  ('Box Jump', 'box-jump'),
  ('Dumbbell Glute Bridge', 'dumbbell-glute-bridge'),
  ('Dumbbell Hip Thrust', 'dumbbell-hip-thrust'),
  ('Dumbbell Reverse Lunge', 'dumbbell-reverse-lunge'),
  ('Dumbbell Supinating Curl', 'dumbbell-supinating-curl')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;
