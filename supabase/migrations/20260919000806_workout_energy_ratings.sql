alter table public.workout_session_feedback
  add column if not exists energy_before smallint check (energy_before between 1 and 5),
  add column if not exists energy_after smallint check (energy_after between 1 and 5);

comment on column public.workout_session_feedback.energy_before is
  'Self-reported energy before the workout: 1 very low to 5 very high.';
comment on column public.workout_session_feedback.energy_after is
  'Self-reported energy after the workout: 1 very low to 5 very high.';
