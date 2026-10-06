-- The client chooses one location before each workout. Keep it on each logged
-- exercise so history and previous machine weights can be scoped to that gym.
alter table public.client_workout_logs
  add column if not exists gym_name text;

comment on column public.client_workout_logs.gym_name is
  'Gym, home, or outdoor location selected for this workout.';
