-- Run once against the live project (SQL Editor) after migrations are applied,
-- to seed the first live test client account for LIVE-SETUP.md step 5.
-- Safe to re-run: each insert is a no-op once the row already exists.

insert into public.client_programs (
  client_email,
  client_name,
  initials,
  program_title,
  program_summary,
  sheet_url,
  fitness_goal,
  focus_target,
  height,
  starting_weight,
  starting_bodyfat,
  workouts,
  active
)
select
  'benzzzzy@gmail.com',
  'Benjamin',
  'BG',
  'Benjamin Program',
  'Fitness goal: gain muscle/reduce bodyfat. Focus target: chest.',
  'https://docs.google.com/spreadsheets/d/1FwQnaZSlVPRNC__1t-V13qQ3kYjxtMaKyuZnDK1Fx0U/edit?usp=drive_link',
  'Gain muscle/reduce bodyfat',
  'Chest',
  'Not set',
  'Not set',
  'Not set',
  '[
    {
      "title": "Workout 1",
      "focus": "Push",
      "format": "single",
      "exercises": [
        { "code": "A", "name": "Dumbbell Bench Press", "prescription": "15 reps x 4 sets", "rest": "60-90s rest" },
        { "code": "B", "name": "Incline Dumbbell Press", "prescription": "10-12 reps x 3 sets", "rest": "60-90s rest" },
        { "code": "C", "name": "Overhead Shoulder Press", "prescription": "8-10 reps x 3 sets", "rest": "60-90s rest" }
      ]
    },
    {
      "title": "Workout 2",
      "focus": "Superset",
      "format": "superset",
      "exercises": [
        { "code": "A1", "name": "Dumbbell Row", "prescription": "12 reps x 3 sets", "rest": "" },
        { "code": "A2", "name": "Push-Up", "prescription": "12 reps x 3 sets", "rest": "60-90s rest after pair" },
        { "code": "D", "name": "Lateral Raise", "prescription": "12-20 reps x 3 sets", "rest": "45-60s rest" },
        { "code": "E", "name": "Tricep Pushdown", "prescription": "12-15 reps x 3 sets", "rest": "45-60s rest" }
      ]
    },
    {
      "title": "Workout 3",
      "focus": "Circuit",
      "format": "circuit",
      "exercises": [
        { "code": "A", "name": "Goblet Squat", "prescription": "12 reps x 3 rounds", "rest": "" },
        { "code": "B", "name": "Dumbbell Romanian Deadlift", "prescription": "12 reps x 3 rounds", "rest": "" },
        { "code": "C", "name": "Plank", "prescription": "30-45 seconds x 3 rounds", "rest": "60-90s rest after round" }
      ]
    }
  ]'::jsonb,
  true
where not exists (
  select 1
  from public.client_programs
  where lower(client_email) = lower('benzzzzy@gmail.com')
  and active
);

insert into public.client_progress (
  client_email,
  entry_date,
  bodyweight,
  bodyfat,
  goal_note
)
select
  'benzzzzy@gmail.com',
  current_date,
  null,
  null,
  'First live portal test.'
where not exists (
  select 1
  from public.client_progress
  where lower(client_email) = lower('benzzzzy@gmail.com')
);
