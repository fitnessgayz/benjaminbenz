alter table public.client_workout_logs
add column if not exists workout_duration_seconds integer,
add column if not exists completed_at timestamptz;

alter table public.client_workout_logs
drop constraint if exists client_workout_logs_workout_duration_seconds_check;

alter table public.client_workout_logs
add constraint client_workout_logs_workout_duration_seconds_check
check (workout_duration_seconds is null or workout_duration_seconds >= 0);

comment on column public.client_workout_logs.workout_duration_seconds is
  'Elapsed workout time in seconds, saved on every row when the client finishes the workout.';

comment on column public.client_workout_logs.completed_at is
  'UTC timestamp recorded when the client finishes the workout.';
