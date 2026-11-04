-- Link the fifth reviewed set, exact name variants, and correct a legacy cable/machine media swap.
with cards(name, slug) as (
  values
  ('Glute Builder Hip Thrust', 'glute-builder-hip-thrust-v2'),
  ('lat pull neutral grip', 'lat-pull-neutral-grip'),
  ('Rear-Delt Cable Fly', 'rear-delt-cable-fly'),
  ('Glute Builder Kickback', 'glute-builder-kickback-v2'),
  ('Incline chest press machine — single arm side', 'incline-chest-press-machine-single-arm-side'),
  ('Body weight tricep dip', 'body-weight-tricep-dip'),
  ('Decline cable chest press', 'decline-cable-chest-press'),
  ('Hip Thrust Machine (Resistance Band)', 'hip-thrust-machine-resistance-band'),
  ('Abduction', 'abduction'),
  ('Seated Cable Row - neutral grip', 'seated-cable-row-neutral-grip')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('90/90 hip switches', '90/90 Hip Switch'),
  ('Ab Crunch', 'Crunches'),
  ('Ab roller', 'Ab Wheel Rollout'),
  ('Abs crunches', 'Crunches'),
  ('An crunch machine', 'Ab Crunch Machine'),
  ('Bicycle kick', 'Bicycle Kicks'),
  ('DB Tricep Kickback', 'Dumbbell Triceps Kickback'),
  ('Decliners chest press machine', 'Decline Chest Press Machine'),
  ('Dumber tricep kickback', 'Dumbbell Triceps Kickback'),
  ('EZ Bicep Curl', 'EZ-Bar Biceps Curl'),
  ('Hip adductor machine', 'Hip Adduction Machine'),
  ('Lat pulldown - wide grip', 'Wide-Grip Lat Pulldown'),
  ('Pec deck reverse fly', 'Reverse Pec Deck'),
  ('Rear Delt Machine Fly', 'Reverse Pec Deck'),
  ('Reverse Fly - Cable', 'Cable Reverse Fly'),
  ('Rope Triceps Pushdown', 'Rope Triceps Pressdown'),
  ('Seated row machine', 'Row Machine'),
  ('sit ups', 'Sit Up'),
  ('step up (dumbbell)', 'Dumbbell Step Up'),
  ('step ups body weight', 'Step Ups'),
  ('Step-up', 'Step Ups'),
  ('Straight Arm Pull Down', 'Straight-Arm Lat Pulldown'),
  ('Tricep DB Kickback', 'Dumbbell Triceps Kickback'),
  ('Tricep pressdown', 'Cable Triceps Pushdown'),
  ('Tricep Pulldown', 'Cable Triceps Pushdown'),
  ('Tricep pushdown', 'Cable Triceps Pushdown'),
  ('Triceps Dip Machine', 'Seated Dip Machine'),
  ('Walking Dumbbell Lunge', 'Dumbbell Walking Lunge'),
  ('Hip Thrust - single leg', 'Single Leg Hip Thrust'),
  ('Cable decline press', 'Decline cable chest press'),
  ('Decline cable press', 'Decline cable chest press')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

-- Move the underhand cable image and video to their correctly named exercise.
update public.exercise_library
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/decline-chest-press-machine.webp',
    motion_url = null,
    updated_at = now()
where name = 'Decline Chest Press'
  and is_active and is_approved
  and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-06/webp-768/decline-cable-chest-press-underhand.webp'
  and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-06/decline-cable-chest-press-underhand.mp4';

update public.exercise_library
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-06/webp-768/decline-cable-chest-press-underhand.webp',
    motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-06/decline-cable-chest-press-underhand.mp4',
    primary_muscle = 'chest',
    equipment = 'cable',
    updated_at = now()
where name = 'Decline Cable Chest Press — Underhand'
  and is_active and is_approved and image_url is null;
