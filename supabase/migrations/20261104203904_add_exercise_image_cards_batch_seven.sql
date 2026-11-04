-- Link the seventh reviewed card set and ten matching name variants.
with cards(name, slug) as (
  values
  ('Leg Press - single leg', 'leg-press-single-leg'),
  ('Oblique crunch', 'oblique-crunch'),
  ('Reverse Delt Flys', 'reverse-delt-flys'),
  ('Single-Arm Cable Row', 'single-arm-cable-row'),
  ('Single-Arm Incline Dumbbell Chest Press', 'single-arm-incline-dumbbell-chest-press'),
  ('Incline Row', 'incline-row'),
  ('Hip Thrust - hip band', 'hip-thrust-hip-band'),
  ('Pallof Press - Side Step', 'pallof-press-side-step'),
  ('Single-Leg Squat to Row', 'single-leg-squat-to-row'),
  ('Tricep machine', 'tricep-machine')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('Assisted Pull-Up Machine', 'Assisted Pull-Up'),
  ('cable oblique twist', 'Cable Rotation'),
  ('Cable Torso Twists', 'Cable Rotation'),
  ('Cable twist', 'Cable Rotation'),
  ('Child’s Pose Breathing', 'Child''s Pose'),
  ('Open-Book Thoracic Rotation', 'Side-Lying Open Book'),
  ('Thoracic Open Book Stretch', 'Side-Lying Open Book'),
  ('Push-Up (stop 2 reps before failure)', 'Push-Up'),
  ('Seated Hip Abduction', 'Hip Abduction Machine'),
  ('World’s greatest stretch with rotation', 'World''s Greatest Stretch')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;
