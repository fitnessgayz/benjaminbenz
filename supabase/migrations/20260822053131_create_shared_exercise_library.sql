create table public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  aliases text[] not null default '{}',
  primary_muscle text not null check (primary_muscle in (
    'chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'quads',
    'hamstrings', 'glutes', 'calves', 'core', 'adductors', 'full_body'
  )),
  secondary_muscles text[] not null default '{}',
  equipment text not null check (equipment in (
    'bodyweight', 'dumbbell', 'barbell', 'cable', 'machine',
    'smith_machine', 'bench', 'other'
  )),
  difficulty text not null default 'beginner' check (difficulty in ('beginner', 'intermediate', 'advanced')),
  movement_pattern text not null default '',
  default_sets integer not null default 3 check (default_sets between 1 and 10),
  default_reps text not null default '8-12',
  default_rest_seconds integer not null default 90 check (default_rest_seconds between 0 and 600),
  substitution_group text not null default '',
  demo_url text check (
    demo_url is null
    or demo_url ~* '^https://(www\.)?(youtube\.com|youtu\.be)/'
  ),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  is_approved boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index exercise_library_name_unique_idx
  on public.exercise_library (lower(name));

create index exercise_library_client_browse_idx
  on public.exercise_library (is_active, is_approved, primary_muscle, sort_order, name);

alter table public.exercise_library enable row level security;

create policy "Clients can browse approved exercises"
on public.exercise_library
for select
to authenticated
using (
  (is_active and is_approved)
  or (select public.is_coach_admin())
);

create policy "Coach can add exercises"
on public.exercise_library
for insert
to authenticated
with check ((select public.is_coach_admin()));

create policy "Coach can update exercises"
on public.exercise_library
for update
to authenticated
using ((select public.is_coach_admin()))
with check ((select public.is_coach_admin()));

create policy "Coach can delete exercises"
on public.exercise_library
for delete
to authenticated
using ((select public.is_coach_admin()));

revoke all on table public.exercise_library from anon;
grant select, insert, update, delete on table public.exercise_library to authenticated;

insert into public.exercise_library
  (name, primary_muscle, equipment, difficulty, movement_pattern, default_reps, default_rest_seconds, substitution_group, sort_order)
values
  ('Barbell Bench Press', 'chest', 'barbell', 'intermediate', 'horizontal_press', '6-10', 120, 'horizontal_press', 10),
  ('Dumbbell Bench Press', 'chest', 'dumbbell', 'beginner', 'horizontal_press', '8-12', 90, 'horizontal_press', 20),
  ('Incline Dumbbell Press', 'chest', 'dumbbell', 'beginner', 'incline_press', '8-12', 90, 'incline_press', 30),
  ('Machine Chest Press', 'chest', 'machine', 'beginner', 'horizontal_press', '8-12', 75, 'horizontal_press', 40),
  ('Incline Machine Chest Press', 'chest', 'machine', 'beginner', 'incline_press', '8-12', 75, 'incline_press', 50),
  ('Cable Chest Fly', 'chest', 'cable', 'beginner', 'chest_fly', '10-15', 60, 'chest_fly', 60),
  ('Decline Cable Fly', 'chest', 'cable', 'intermediate', 'chest_fly', '10-15', 60, 'chest_fly', 70),
  ('Push-Up', 'chest', 'bodyweight', 'beginner', 'horizontal_press', '8-15', 60, 'horizontal_press', 80),
  ('Lat Pulldown', 'lats', 'cable', 'beginner', 'vertical_pull', '8-12', 75, 'vertical_pull', 100),
  ('Close-Grip Lat Pulldown', 'lats', 'cable', 'beginner', 'vertical_pull', '8-12', 75, 'vertical_pull', 110),
  ('Assisted Pull-Up', 'lats', 'machine', 'beginner', 'vertical_pull', '6-10', 90, 'vertical_pull', 120),
  ('Pull-Up', 'lats', 'bodyweight', 'advanced', 'vertical_pull', '5-10', 120, 'vertical_pull', 130),
  ('Seated Cable Row', 'back', 'cable', 'beginner', 'horizontal_pull', '8-12', 75, 'horizontal_pull', 140),
  ('One-Arm Dumbbell Row', 'back', 'dumbbell', 'beginner', 'horizontal_pull', '8-12 each', 75, 'horizontal_pull', 150),
  ('Chest-Supported Dumbbell Row', 'back', 'dumbbell', 'beginner', 'horizontal_pull', '8-12', 75, 'horizontal_pull', 160),
  ('Face Pull', 'back', 'cable', 'beginner', 'rear_delt_pull', '12-15', 60, 'rear_delt', 170),
  ('Reverse Fly', 'shoulders', 'machine', 'beginner', 'rear_delt_fly', '12-15', 60, 'rear_delt', 180),
  ('Seated Dumbbell Shoulder Press', 'shoulders', 'dumbbell', 'beginner', 'vertical_press', '8-12', 90, 'vertical_press', 200),
  ('Machine Shoulder Press', 'shoulders', 'machine', 'beginner', 'vertical_press', '8-12', 75, 'vertical_press', 210),
  ('Dumbbell Lateral Raise', 'shoulders', 'dumbbell', 'beginner', 'lateral_raise', '12-15', 60, 'lateral_raise', 220),
  ('Cable Lateral Raise', 'shoulders', 'cable', 'beginner', 'lateral_raise', '12-15', 60, 'lateral_raise', 230),
  ('Barbell Curl', 'biceps', 'barbell', 'beginner', 'elbow_flexion', '8-12', 60, 'biceps_curl', 250),
  ('Dumbbell Curl', 'biceps', 'dumbbell', 'beginner', 'elbow_flexion', '8-12', 60, 'biceps_curl', 260),
  ('Incline Dumbbell Curl', 'biceps', 'dumbbell', 'intermediate', 'elbow_flexion', '8-12', 60, 'biceps_curl', 270),
  ('Hammer Curl', 'biceps', 'dumbbell', 'beginner', 'elbow_flexion', '8-12', 60, 'biceps_curl', 280),
  ('Cable Curl', 'biceps', 'cable', 'beginner', 'elbow_flexion', '10-15', 60, 'biceps_curl', 290),
  ('Preacher Curl', 'biceps', 'machine', 'beginner', 'elbow_flexion', '8-12', 60, 'biceps_curl', 300),
  ('Rope Triceps Pressdown', 'triceps', 'cable', 'beginner', 'elbow_extension', '10-15', 60, 'triceps_extension', 310),
  ('Overhead Cable Triceps Extension', 'triceps', 'cable', 'beginner', 'elbow_extension', '10-15', 60, 'triceps_extension', 320),
  ('Seated Dip Machine', 'triceps', 'machine', 'beginner', 'dip', '8-12', 75, 'dip', 330),
  ('Bench Dip', 'triceps', 'bench', 'intermediate', 'dip', '8-15', 75, 'dip', 340),
  ('Goblet Squat', 'quads', 'dumbbell', 'beginner', 'squat', '8-12', 90, 'squat', 400),
  ('Hack Squat', 'quads', 'machine', 'beginner', 'squat', '8-12', 120, 'squat', 410),
  ('Leg Press', 'quads', 'machine', 'beginner', 'squat', '8-12', 120, 'squat', 420),
  ('Bulgarian Split Squat', 'quads', 'dumbbell', 'intermediate', 'single_leg_squat', '8-12 each', 90, 'single_leg_squat', 430),
  ('Leg Extension', 'quads', 'machine', 'beginner', 'knee_extension', '10-15', 60, 'knee_extension', 440),
  ('Dumbbell Romanian Deadlift', 'hamstrings', 'dumbbell', 'intermediate', 'hinge', '8-12', 90, 'hinge', 450),
  ('Hip Thrust', 'glutes', 'barbell', 'intermediate', 'hip_extension', '8-12', 90, 'hip_extension', 460),
  ('Hip Thrust Machine', 'glutes', 'machine', 'beginner', 'hip_extension', '8-12', 90, 'hip_extension', 470),
  ('Seated Leg Curl', 'hamstrings', 'machine', 'beginner', 'knee_flexion', '10-15', 60, 'knee_flexion', 480),
  ('Standing Leg Curl', 'hamstrings', 'machine', 'beginner', 'knee_flexion', '10-15 each', 60, 'knee_flexion', 490),
  ('Hip Abduction Machine', 'glutes', 'machine', 'beginner', 'hip_abduction', '12-20', 60, 'hip_abduction', 500),
  ('45-Degree Back Extension', 'glutes', 'bench', 'beginner', 'hip_extension', '10-15', 60, 'hip_extension', 510),
  ('Cable Glute Kickback', 'glutes', 'cable', 'beginner', 'hip_extension', '12-15 each', 60, 'hip_extension', 520),
  ('Hip Adduction Machine', 'adductors', 'machine', 'beginner', 'hip_adduction', '12-20', 60, 'hip_adduction', 530),
  ('Standing Calf Raise', 'calves', 'machine', 'beginner', 'plantar_flexion', '10-15', 60, 'calf_raise', 540),
  ('Seated Calf Raise', 'calves', 'machine', 'beginner', 'plantar_flexion', '12-20', 60, 'calf_raise', 550),
  ('Plank', 'core', 'bodyweight', 'beginner', 'anti_extension', '30-60 sec', 45, 'core_stability', 600),
  ('Side Plank', 'core', 'bodyweight', 'beginner', 'anti_lateral_flexion', '20-45 sec each', 45, 'core_stability', 610),
  ('Dead Bug', 'core', 'bodyweight', 'beginner', 'anti_extension', '8-12 each', 45, 'core_stability', 620),
  ('Pallof Press', 'core', 'cable', 'beginner', 'anti_rotation', '10-12 each', 45, 'core_stability', 630),
  ('Cable Crunch', 'core', 'cable', 'beginner', 'spinal_flexion', '10-15', 60, 'core_flexion', 640),
  ('Hanging Knee Raise', 'core', 'bodyweight', 'intermediate', 'hip_flexion', '8-15', 60, 'core_flexion', 650);

update public.exercise_library set
  aliases = case name
    when 'Barbell Bench Press' then array['Bench press', 'Flat bench press']
    when 'Dumbbell Bench Press' then array['Dumbbell Chest Press', 'Flat bench dumbbell press']
    when 'Incline Dumbbell Press' then array['Incline dumbbell chest press', 'Incline DB chest press', 'Dumbell incline press']
    when 'Lat Pulldown' then array['Lat Pull Down', 'Lat Pulldown Machine']
    when 'Close-Grip Lat Pulldown' then array['Close grip lat pull down', 'Closed grip lat pull down']
    when 'One-Arm Dumbbell Row' then array['Single arm DB rows', 'Single Arm Dumbbell Row', 'Single arm Dumbell row']
    when 'Seated Dumbbell Shoulder Press' then array['DB Shoulder Press', 'Shoulder press']
    when 'Dumbbell Curl' then array['Bicep Curl', 'DB Bicep Curl', 'Dumbell curl']
    when 'Bulgarian Split Squat' then array['Bulgarian lunge', 'Bulgarian lunge smith machine']
    when 'Dumbbell Romanian Deadlift' then array['DB RDL', 'Dumbbell RDL']
    when 'Hip Thrust Machine' then array['Machine Hip Thrust', 'Hip Trust Machine']
    when 'Seated Leg Curl' then array['Leg Curl Machine', 'Leg curls', 'Single Leg Curl machine']
    when '45-Degree Back Extension' then array['Back Extension Glute Focus', 'Back Ext Machine Glute Focused']
    else aliases
  end,
  secondary_muscles = case
    when primary_muscle = 'chest' then array['triceps', 'shoulders']
    when primary_muscle in ('back', 'lats') then array['biceps']
    when primary_muscle = 'quads' then array['glutes']
    when primary_muscle = 'hamstrings' then array['glutes']
    else secondary_muscles
  end;
