-- Keep the branded mobility cards attached and add only exact demonstrations
-- published by the official National Academy of Sports Medicine channel.
with mobility_media(name, slug, demo_url) as (
  values
    ('Doorway Chest Stretch', 'doorway-chest-stretch', null),
    ('Walking Lunge With Rotation', 'walking-lunge-with-rotation', null),
    ('Arm Circles', 'arm-circles', null),
    ('Standing Hip Opener', 'standing-hip-opener', null),
    ('Front-to-Back Leg Swings', 'front-to-back-leg-swings', null),
    ('Lateral Leg Swings', 'lateral-leg-swings', null),
    ('Multiplanar Lunge With Reach', 'multiplanar-lunge-with-reach', 'https://www.youtube.com/watch?v=ynLR-FL1VpA'),
    ('Lateral Tube Walk', 'lateral-tube-walk', null),
    ('Medicine Ball Chop and Lift', 'medicine-ball-chop-and-lift', null),
    ('Push-Up With Rotation', 'push-up-with-rotation', 'https://www.youtube.com/watch?v=miN74vJbE_w')
)
update public.exercise_library as exercise
set
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/' || mobility_media.slug || '.webp',
  demo_url = coalesce(mobility_media.demo_url, exercise.demo_url),
  updated_at = now()
from mobility_media
where lower(exercise.name) = lower(mobility_media.name);
