-- Link exact exercise-library matches to the official NASM video URLs.
-- Existing demo URLs are intentionally preserved so custom/client videos win.
with nasm_videos(name, demo_url) as (
  values
    ('Barbell Bench Press', 'https://www.youtube.com/watch?v=CayG6UYqL8g'),
    ('Incline Barbell Bench Press', 'https://www.youtube.com/watch?v=BjGLs6KGWUc'),
    ('Machine Chest Press', 'https://www.youtube.com/watch?v=lRo9zZ7EwpM'),
    ('Single-Arm Dumbbell Chest Press', 'https://www.youtube.com/watch?v=qFTnmyC-nf4'),
    ('Incline Dumbbell Press', 'https://www.youtube.com/watch?v=JKnpHchOWPU'),
    ('Push-Up', 'https://www.youtube.com/watch?v=WDIpL0pjun0'),
    ('Pull-Up', 'https://www.youtube.com/watch?v=9yVGh3XbJ34'),
    ('Face Pull', 'https://www.youtube.com/watch?v=eTCBSFlCJ_s'),
    ('Barbell Curl', 'https://www.youtube.com/watch?v=pQfJR-sSIvA'),
    ('Bench Dip', 'https://www.youtube.com/watch?v=WVeZDBhZwLA'),
    ('Goblet Squat', 'https://www.youtube.com/watch?v=nfX7IFK9UNI'),
    ('Dumbbell Front Squat', 'https://www.youtube.com/watch?v=hZI8Yy5elZs'),
    ('Bulgarian Split Squat', 'https://www.youtube.com/watch?v=hbw7hdyOpq0'),
    ('Leg Press', 'https://www.youtube.com/watch?v=cDGOn-yfKJA'),
    ('Single-Leg Leg Press', 'https://www.youtube.com/watch?v=3aYsOsBA7ZE'),
    ('Dumbbell Romanian Deadlift', 'https://www.youtube.com/watch?v=V8Hdl1FiNt4'),
    ('Seated Leg Curl', 'https://www.youtube.com/watch?v=_2Kd0d-JEUM'),
    ('Plank', 'https://www.youtube.com/watch?v=mwlp75MS6Rg'),
    ('Side Plank', 'https://www.youtube.com/watch?v=44ND4bOB-T0'),
    ('Dead Bug', 'https://www.youtube.com/watch?v=bxn9FBrt4-A'),
    ('Russian Twist', 'https://www.youtube.com/watch?v=s0kT80JLCfA'),
    ('Child''s Pose', 'https://www.youtube.com/watch?v=_ZX_zTOBgp8'),
    ('Seated Butterfly Stretch', 'https://www.youtube.com/watch?v=v4OLkxi5-Q0')
)
update public.exercise_library as exercise
set
  demo_url = nasm_videos.demo_url,
  updated_at = now()
from nasm_videos
where lower(exercise.name) = lower(nasm_videos.name)
  and exercise.demo_url is null;
