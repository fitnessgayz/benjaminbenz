-- Link the second set of ten reviewed cards and reuse exact-equivalent approved media.
with cards(name, slug) as (
  values
  ('Bicep curl (machine)', 'bicep-curl-machine'),
  ('Concentration Curl', 'concentration-curl'),
  ('Dumbbell Walking Lunge', 'dumbbell-walking-lunge'),
  ('High-to-Low Cable Fly', 'high-to-low-cable-fly'),
  ('Kettlebell Goblet Squat', 'kettlebell-goblet-squat'),
  ('Linear Hack Squat', 'linear-hack-squat'),
  ('Low-to-High Cable Fly', 'low-to-high-cable-fly'),
  ('Reverse Crunch', 'reverse-crunch'),
  ('Side Plank Pulses', 'side-plank-pulses'),
  ('Step Ups', 'step-ups')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active
  and exercise.is_approved
  and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Assisted dip machine', 'Assisted Dip'),
  ('Bicep curl ez curl bar', 'EZ-Bar Biceps Curl'),
  ('Cable Fly', 'Cable Chest Fly'),
  ('cable lat pulldown', 'Lat Pulldown'),
  ('Cable tricep pushdown', 'Cable Triceps Pushdown'),
  ('Decline Bench Press Machine', 'Decline Chest Press Machine'),
  ('Decline chest machine', 'Decline Chest Press Machine'),
  ('Decline machine, chest press', 'Decline Chest Press Machine'),
  ('Dumbbell Fly', 'Dumbbell Chest Fly'),
  ('Dumbbell Hammer Curl', 'Hammer Curl'),
  ('dumbell single arm row', 'One-Arm Dumbbell Row'),
  ('Flat Machine Chest Press', 'Machine Chest Press'),
  ('Hack Squat Machine', 'Hack Squat'),
  ('Incline chest machine', 'Incline Machine Chest Press'),
  ('Kickback machine', 'Glute Kickback Machine'),
  ('Leg Extension Machine', 'Leg Extension'),
  ('Overhead Dumbbell Tricep Extension', 'Overhead Dumbbell Triceps Extension'),
  ('reverse dumbbell flys', 'Dumbbell Reverse Fly'),
  ('Seated Leg Curl Machine', 'Seated Leg Curl'),
  ('single arm row machine', 'Single-Arm Machine Row'),
  ('Wide Grip Pulldown', 'Wide-Grip Lat Pulldown')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;
