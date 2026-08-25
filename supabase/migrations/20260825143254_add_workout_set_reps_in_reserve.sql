-- Stores structured effort feedback for workout sets. The client portal uses
-- the "rir" scale and treats a value of 4 as four or more additional reps.
alter table public.client_workout_logs
add column if not exists effort_scale text;

alter table public.client_workout_logs
add column if not exists effort_value numeric;
