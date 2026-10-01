-- Reconcile the complete official NASM exercise catalog with the shared
-- exercise library. Equivalent naming differences reuse the curated FWB row;
-- meaningful equipment or loading differences remain separate exercises.

-- These two earlier links were too broad: NASM's demonstrations use a
-- kettlebell and stability ball, while the existing FWB rows do not.
update public.exercise_library
set demo_url = null, updated_at = now()
where (name = 'Goblet Squat' and demo_url = 'https://www.youtube.com/watch?v=nfX7IFK9UNI')
   or (name = 'Russian Twist' and demo_url = 'https://www.youtube.com/watch?v=s0kT80JLCfA');

with nasm_exercises(
  name, aliases, primary_muscle, equipment, difficulty, movement_pattern,
  default_reps, default_rest_seconds, substitution_group, demo_url, sort_order
) as (
values
  ('Barbell Deadlift', '{}'::text[], 'quads', 'barbell', 'intermediate', 'hinge', '8-12', 90, 'hinge', 'https://www.youtube.com/watch?v=Z6gcRfPNcZo', 1000),
  ('Kettlebell Deadlift', '{}'::text[], 'quads', 'other', 'beginner', 'hinge', '8-12', 90, 'hinge', 'https://www.youtube.com/watch?v=LnIMaf-XOpM', 1001),
  ('Dumbbell Romanian Deadlift', '{}'::text[], 'hamstrings', 'dumbbell', 'intermediate', 'hinge', '8-12', 90, 'hinge', 'https://www.youtube.com/watch?v=V8Hdl1FiNt4', 1002),
  ('Lying Leg Curl', '{}'::text[], 'hamstrings', 'machine', 'beginner', 'knee_flexion', '8-12', 60, 'knee_flexion', 'https://www.youtube.com/watch?v=Dq5y4WEcqqo', 1003),
  ('Barbell Curl', array['Barbell Bicep Curl']::text[], 'biceps', 'barbell', 'beginner', 'elbow_flexion', '8-12', 60, 'elbow_flexion', 'https://www.youtube.com/watch?v=pQfJR-sSIvA', 1004),
  ('Floor Bridge', '{}'::text[], 'glutes', 'bodyweight', 'beginner', 'hip_extension', '8-12', 60, 'hip_extension', 'https://www.youtube.com/watch?v=Z3cY3d3BBo4', 1005),
  ('Floor Prone Cobra', '{}'::text[], 'back', 'bodyweight', 'beginner', 'core_stability', '8-12', 60, 'core_stability', 'https://www.youtube.com/watch?v=keErJXdp2lE', 1006),
  ('Good Mornings', '{}'::text[], 'hamstrings', 'barbell', 'intermediate', 'hinge', '8-12', 90, 'hinge', 'https://www.youtube.com/watch?v=Daq-wJMUnes', 1007),
  ('Side Plank', '{}'::text[], 'core', 'bodyweight', 'beginner', 'core_stability', '20-60 sec', 60, 'core_stability', 'https://www.youtube.com/watch?v=44ND4bOB-T0', 1008),
  ('Plank', '{}'::text[], 'core', 'bodyweight', 'beginner', 'core_stability', '20-60 sec', 60, 'core_stability', 'https://www.youtube.com/watch?v=mwlp75MS6Rg', 1009),
  ('Plank Walkup', '{}'::text[], 'core', 'bodyweight', 'intermediate', 'core_stability', '20-60 sec', 60, 'core_stability', 'https://www.youtube.com/watch?v=6Tv4xTRPtUc', 1010),
  ('Straight-Arm Plank', '{}'::text[], 'core', 'bodyweight', 'beginner', 'core_stability', '20-60 sec', 60, 'core_stability', 'https://www.youtube.com/watch?v=MDxfAuBbHHA', 1011),
  ('Prisoner Squat', '{}'::text[], 'quads', 'bodyweight', 'beginner', 'squat', '8-12', 90, 'squat', 'https://www.youtube.com/watch?v=UYbsgiiZgao', 1012),
  ('Squat Jump', '{}'::text[], 'full_body', 'bodyweight', 'intermediate', 'plyometric', '6-10', 90, 'plyometric', 'https://www.youtube.com/watch?v=tZSYZdtbONc', 1013),
  ('Bulgarian Split Squat', '{}'::text[], 'quads', 'dumbbell', 'intermediate', 'single_leg_squat', '8-12 each', 60, 'single_leg_squat', 'https://www.youtube.com/watch?v=hbw7hdyOpq0', 1014),
  ('Kettlebell Goblet Squat', array['NASM Kettlebell Goblet Squat']::text[], 'quads', 'other', 'beginner', 'squat', '8-12', 90, 'squat', 'https://www.youtube.com/watch?v=nfX7IFK9UNI', 1015),
  ('Dumbbell Front Squat', '{}'::text[], 'quads', 'dumbbell', 'beginner', 'squat', '8-12', 90, 'squat', 'https://www.youtube.com/watch?v=hZI8Yy5elZs', 1016),
  ('Burpee', array['Squat Thrust (Burpees)']::text[], 'full_body', 'bodyweight', 'advanced', 'plyometric', '6-10', 90, 'plyometric', 'https://www.youtube.com/watch?v=Ny8JWqh4lNg', 1017),
  ('Kettlebell Front Squat', '{}'::text[], 'quads', 'other', 'beginner', 'squat', '8-12', 90, 'squat', 'https://www.youtube.com/watch?v=-TeEMXoHQPM', 1018),
  ('Bird Dog', '{}'::text[], 'core', 'bodyweight', 'beginner', 'core_stability', '8-12', 60, 'core_stability', 'https://www.youtube.com/watch?v=ZdAHe9_HeEw', 1019),
  ('Pull-Up', '{}'::text[], 'back', 'bodyweight', 'intermediate', 'vertical_pull', '8-12', 90, 'vertical_pull', 'https://www.youtube.com/watch?v=9yVGh3XbJ34', 1020),
  ('Band Assisted Pull-Up', '{}'::text[], 'back', 'other', 'intermediate', 'vertical_pull', '8-12', 90, 'vertical_pull', 'https://www.youtube.com/watch?v=B_VkNQS5YLs', 1021),
  ('Barbell Romanian Deadlift', array['Romanian Deadlift (Barbell)']::text[], 'hamstrings', 'barbell', 'intermediate', 'hinge', '8-12', 90, 'hinge', 'https://www.youtube.com/watch?v=xgusDooVfKU', 1022),
  ('Stability Ball Russian Twist', array['NASM Stability Ball Russian Twist']::text[], 'core', 'other', 'intermediate', 'rotation', '8-12', 60, 'rotation', 'https://www.youtube.com/watch?v=s0kT80JLCfA', 1023),
  ('Reverse Crunch to Knee-Up with Rotation', '{}'::text[], 'core', 'bench', 'intermediate', 'rotation', '8-12', 60, 'rotation', 'https://www.youtube.com/watch?v=wtKWBzDwfIM', 1024),
  ('Push-Up', '{}'::text[], 'chest', 'bodyweight', 'beginner', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=WDIpL0pjun0', 1025),
  ('Plyometric Push-Up', '{}'::text[], 'chest', 'bodyweight', 'intermediate', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=MH4gcTKQiEc', 1026),
  ('Pike Push-Up', '{}'::text[], 'shoulders', 'bodyweight', 'intermediate', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=2b5t0Cu2nQI', 1027),
  ('Inverted Push-Up', '{}'::text[], 'shoulders', 'other', 'intermediate', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=h45WmYKSJG0', 1028),
  ('Decline Push-Up', '{}'::text[], 'chest', 'bench', 'intermediate', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=DBz85WuXqMk', 1029),
  ('Incline Push-Up', '{}'::text[], 'chest', 'bench', 'beginner', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=0JUrOH--Kdk', 1030),
  ('Archer Push-Up', '{}'::text[], 'chest', 'other', 'advanced', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=IDu6pRAPChg', 1031),
  ('Modified Push-Up', '{}'::text[], 'chest', 'bodyweight', 'beginner', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=PDr5B2jLUOw', 1032),
  ('Leg Press Calf Raise', '{}'::text[], 'calves', 'machine', 'beginner', 'plantar_flexion', '8-12', 60, 'plantar_flexion', 'https://www.youtube.com/watch?v=8k435cj30gc', 1033),
  ('Jumping Jacks', '{}'::text[], 'full_body', 'bodyweight', 'beginner', 'plyometric', '6-10', 90, 'plyometric', 'https://www.youtube.com/watch?v=uLVt6u15L98', 1034),
  ('Leg Press', '{}'::text[], 'quads', 'machine', 'beginner', 'squat', '8-12', 90, 'squat', 'https://www.youtube.com/watch?v=cDGOn-yfKJA', 1035),
  ('Single-Leg Leg Press', array['Single Leg Press']::text[], 'quads', 'machine', 'beginner', 'squat', '8-12 each', 90, 'squat', 'https://www.youtube.com/watch?v=3aYsOsBA7ZE', 1036),
  ('Box Jump', array['Box Jumps']::text[], 'glutes', 'other', 'intermediate', 'plyometric', '6-10', 90, 'plyometric', 'https://www.youtube.com/watch?v=DXu-8TAJwi4', 1037),
  ('Iron Cross', '{}'::text[], 'back', 'bodyweight', 'intermediate', 'stretching', '8-12', 60, 'stretching', 'https://www.youtube.com/watch?v=uBEXsoMclPY', 1038),
  ('Kettlebell Crush Curl with Squat', '{}'::text[], 'biceps', 'other', 'beginner', 'elbow_flexion', '8-12', 60, 'elbow_flexion', 'https://www.youtube.com/watch?v=BPGOyQKy9R0', 1039),
  ('Face Pull', '{}'::text[], 'shoulders', 'cable', 'beginner', 'rear_delt_pull', '8-12', 60, 'rear_delt_pull', 'https://www.youtube.com/watch?v=eTCBSFlCJ_s', 1040),
  ('Cable Crossover', '{}'::text[], 'chest', 'cable', 'beginner', 'chest_fly', '8-12', 60, 'chest_fly', 'https://www.youtube.com/watch?v=XY6JrX1wyxk', 1041),
  ('Standing Tubing Row', '{}'::text[], 'back', 'other', 'beginner', 'horizontal_pull', '8-12', 60, 'horizontal_pull', 'https://www.youtube.com/watch?v=qykwviNOIyc', 1042),
  ('Close-Grip Barbell Bench Press', array['Close Grip Bench Press']::text[], 'triceps', 'barbell', 'beginner', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=LJeqLAmJLfs', 1043),
  ('Dead Bug', '{}'::text[], 'core', 'bodyweight', 'beginner', 'core_stability', '8-12', 60, 'core_stability', 'https://www.youtube.com/watch?v=bxn9FBrt4-A', 1044),
  ('Lunge Jump', '{}'::text[], 'full_body', 'bodyweight', 'intermediate', 'plyometric', '6-10', 90, 'plyometric', 'https://www.youtube.com/watch?v=_5kDxC0flg0', 1045),
  ('Close-Grip Seated Machine Row', array['Seated Machine Row: Close Grip']::text[], 'back', 'cable', 'beginner', 'horizontal_pull', '8-12', 60, 'horizontal_pull', 'https://www.youtube.com/watch?v=k0cTJCfxa0Y', 1046),
  ('Child''s Pose', '{}'::text[], 'back', 'bodyweight', 'beginner', 'stretching', '30-60 sec', 60, 'stretching', 'https://www.youtube.com/watch?v=_ZX_zTOBgp8', 1047),
  ('Tuck Jump', '{}'::text[], 'full_body', 'bodyweight', 'intermediate', 'plyometric', '6-10', 90, 'plyometric', 'https://www.youtube.com/watch?v=-bnJGikRGsM', 1048),
  ('Cable Chest Fly', array['Two-Arm Standing Cable Fly']::text[], 'chest', 'cable', 'beginner', 'chest_fly', '8-12', 60, 'chest_fly', 'https://www.youtube.com/watch?v=XNf6TBErGys', 1049),
  ('Bench Dip', array['Bench Dips']::text[], 'triceps', 'bench', 'intermediate', 'dip', '8-12', 60, 'dip', 'https://www.youtube.com/watch?v=WVeZDBhZwLA', 1050),
  ('Machine Chest Press', array['Chest Press Machine']::text[], 'chest', 'machine', 'beginner', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=lRo9zZ7EwpM', 1051),
  ('Single-Arm Dumbbell Chest Press', '{}'::text[], 'chest', 'dumbbell', 'intermediate', 'horizontal_press', '8-12 each', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=qFTnmyC-nf4', 1052),
  ('Two-Arm Dumbbell Chest Press with Band', '{}'::text[], 'chest', 'dumbbell', 'intermediate', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=_x5m-s8xTf0', 1053),
  ('Single-Arm Incline Dumbbell Chest Press', '{}'::text[], 'chest', 'dumbbell', 'intermediate', 'horizontal_press', '8-12 each', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=iJ-GwVeUuCg', 1054),
  ('Incline Dumbbell Press', array['Two-Arm Incline Dumbbell Chest Press']::text[], 'chest', 'dumbbell', 'beginner', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=JKnpHchOWPU', 1055),
  ('Lying Leg Curl: Two-Leg Concentric, Single-Leg Eccentric', '{}'::text[], 'hamstrings', 'machine', 'intermediate', 'knee_flexion', '8-12 each', 60, 'knee_flexion', 'https://www.youtube.com/watch?v=_7sVQlruVZc', 1056),
  ('Lying Leg Curl: Single-Leg', '{}'::text[], 'hamstrings', 'machine', 'beginner', 'knee_flexion', '8-12 each', 60, 'knee_flexion', 'https://www.youtube.com/watch?v=kGIfh3hHY0w', 1057),
  ('Seated Leg Curl', '{}'::text[], 'hamstrings', 'machine', 'beginner', 'knee_flexion', '8-12', 60, 'knee_flexion', 'https://www.youtube.com/watch?v=_2Kd0d-JEUM', 1058),
  ('Single-Leg Seated Leg Curl', '{}'::text[], 'hamstrings', 'machine', 'beginner', 'knee_flexion', '8-12 each', 60, 'knee_flexion', 'https://www.youtube.com/watch?v=PXNJ71rksvU', 1059),
  ('Single-Leg Squat', '{}'::text[], 'quads', 'bodyweight', 'advanced', 'single_leg_squat', '8-12 each', 60, 'single_leg_squat', 'https://www.youtube.com/watch?v=sSXnaFyhiZs', 1060),
  ('Single-Leg Squat Touchdown', '{}'::text[], 'quads', 'bodyweight', 'advanced', 'single_leg_squat', '8-12 each', 60, 'single_leg_squat', 'https://www.youtube.com/watch?v=h6lET2_DLA0', 1061),
  ('Single-Leg Squat to Row', '{}'::text[], 'quads', 'cable', 'advanced', 'single_leg_squat', '8-12 each', 60, 'single_leg_squat', 'https://www.youtube.com/watch?v=LmGbrgGJS6E', 1062),
  ('Barbell Bench Press', '{}'::text[], 'chest', 'barbell', 'beginner', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=CayG6UYqL8g', 1063),
  ('Barbell Bench Press with Bands', '{}'::text[], 'chest', 'barbell', 'advanced', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=N4H4o8k9WbE', 1064),
  ('Barbell Bench Press with Chains', '{}'::text[], 'chest', 'barbell', 'advanced', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=6UKcYcDme-Y', 1065),
  ('Incline Barbell Bench Press', '{}'::text[], 'chest', 'barbell', 'intermediate', 'horizontal_press', '8-12', 90, 'horizontal_press', 'https://www.youtube.com/watch?v=BjGLs6KGWUc', 1066),
  ('Foam Roll Adductors', array['Foam Roll: Adductors']::text[], 'adductors', 'other', 'beginner', 'stretching', '30-60 sec', 60, 'stretching', 'https://www.youtube.com/watch?v=Nqol0T6rKDg', 1067),
  ('Foam Roll Calves', array['Foam Roll: Calves']::text[], 'calves', 'other', 'beginner', 'stretching', '30-60 sec', 60, 'stretching', 'https://www.youtube.com/watch?v=6f2LO5EeB0I', 1068),
  ('Foam Roll Latissimus Dorsi', array['Foam Roll: Latissimus Dorsi']::text[], 'back', 'other', 'beginner', 'stretching', '30-60 sec', 60, 'stretching', 'https://www.youtube.com/watch?v=5S2suclGl7o', 1069),
  ('Seated Butterfly Stretch', array['Static: Butterfly Stretch']::text[], 'adductors', 'bodyweight', 'beginner', 'stretching', '30-60 sec', 60, 'stretching', 'https://www.youtube.com/watch?v=v4OLkxi5-Q0', 1070),
  ('Static Latissimus Dorsi Ball Stretch', array['Static: Latissimus Dorsi Ball Stretch']::text[], 'lats', 'other', 'beginner', 'stretching', '30-60 sec', 60, 'stretching', 'https://www.youtube.com/watch?v=kEH6jatSVSw', 1071),
  ('Static Seated Calf Stretch', array['Static: Seated Calf Stretch']::text[], 'calves', 'other', 'beginner', 'stretching', '30-60 sec', 60, 'stretching', 'https://www.youtube.com/watch?v=83G00Fwlqqw', 1072),
  ('Static Standing Adductor Stretch', array['Static: Standing Adductor Stretch']::text[], 'adductors', 'bodyweight', 'beginner', 'stretching', '30-60 sec', 60, 'stretching', 'https://www.youtube.com/watch?v=IzHUoWs0maQ', 1073),
  ('Single-Leg Balance Reach: Frontal Plane', '{}'::text[], 'full_body', 'bodyweight', 'beginner', 'balance', '8-12 each', 60, 'balance', 'https://www.youtube.com/watch?v=UrB5wA7B3hI', 1074)
)
insert into public.exercise_library (
  name, aliases, primary_muscle, equipment, difficulty, movement_pattern,
  default_sets, default_reps, default_rest_seconds, substitution_group,
  demo_url, instructions, is_approved, is_active, sort_order
)
select
  name,
  aliases,
  primary_muscle,
  equipment,
  difficulty,
  movement_pattern,
  3,
  default_reps,
  default_rest_seconds,
  substitution_group,
  demo_url,
  'Use the linked NASM demonstration for setup and execution. Move with control, maintain stable alignment, and stay within a pain-free range of motion.',
  true,
  true,
  sort_order
from nasm_exercises
on conflict (lower(name)) do update set
  aliases = array(
    select distinct alias
    from unnest(coalesce(public.exercise_library.aliases, '{}'::text[]) || excluded.aliases) as alias
    where length(trim(alias)) > 0
  ),
  demo_url = excluded.demo_url,
  updated_at = now();
