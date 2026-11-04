-- Link reviewed exercise image cards: 20261104221111_add_exercise_image_cards_batch_fourteen.sql.
with cards(name, slug) as (
  values
  ('Lateral shuffle → controlled stop', 'lateral-shuffle-controlled-stop'),
  ('Lean-away lateral raise', 'lean-away-lateral-raise'),
  ('Leg Press - High Foot Placement', 'leg-press-high-foot-placement'),
  ('Lying Leg Curl', 'lying-leg-curl'),
  ('Lying Leg Curl: Single-Leg', 'lying-leg-curl-single-leg'),
  ('Lying Leg Curl: Two-Leg Concentric, Single-Leg Eccentric', 'lying-leg-curl-two-leg-concentric-single-leg-eccentric-v2'),
  ('Low pogo hops', 'low-pogo-hops'),
  ('Lunge Jump', 'lunge-jump-v3'),
  ('Machine Chest Press (one arm)', 'machine-chest-press-one-arm'),
  ('Machine kickbacks', 'machine-kickbacks')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Close-Grip Seated Machine Row', 'Narrow-Grip Seated Cable Row'),
  ('Decline machine ches press', 'Decline Chest Press Machine'),
  ('Exercise 3close Grip Lat Pulldown', 'Close-Grip Lat Pulldown'),
  ('Leg Press — High and Wide Stance', 'High-and-Wide Leg Press'),
  ('Pec Deck', 'Pec Deck Chest Fly'),
  ('Reverse pec deck or rear-delt fly', 'Reverse Pec Deck'),
  ('Row machine - single arm', 'Single-Arm Machine Row'),
  ('standing cable chest fly', 'Cable Chest Fly'),
  ('Tricep dip machine', 'Seated Dip Machine')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

