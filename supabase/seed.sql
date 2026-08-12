-- Synthetic local-development records only. Never copy production client rows here.

insert into public.client_programs (
  id,
  client_email,
  client_name,
  program_title,
  program_summary,
  fitness_goal,
  focus_target,
  coach_note_title,
  coach_note_body
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'alex.client@example.test',
    'Alex Example',
    'Strength Foundations',
    'A synthetic local-only training plan.',
    'Build consistent strength habits',
    'Three quality sessions each week',
    'Keep it steady',
    'Quality reps and honest check-ins beat perfection.'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'riley.client@example.test',
    'Riley Example',
    'Mobility Reset',
    'A second synthetic plan used to verify client isolation.',
    'Move comfortably',
    'Daily mobility practice',
    'Stay curious',
    'Notice what feels better week to week.'
  )
on conflict (id) do nothing;
insert into public.client_progress (
  id,
  client_email,
  entry_date,
  bodyweight,
  bodyfat,
  goal_note
)
values
  (
    '30000000-0000-4000-8000-000000000003',
    'alex.client@example.test',
    current_date,
    175.5,
    null,
    'Synthetic baseline check-in'
  )
on conflict (id) do nothing;

insert into public.client_workout_logs (
  id,
  client_email,
  entry_date,
  workout_title,
  exercise_name,
  set_number,
  weight_used,
  reps,
  notes
)
values
  (
    '40000000-0000-4000-8000-000000000004',
    'alex.client@example.test',
    current_date,
    'Synthetic Session A',
    'Goblet Squat',
    1,
    35,
    10,
    'Local test data'
  )
on conflict (id) do nothing;
