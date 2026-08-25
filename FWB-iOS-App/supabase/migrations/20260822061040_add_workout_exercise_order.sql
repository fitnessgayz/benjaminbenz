alter table public.client_workout_logs
add column if not exists exercise_order integer;

alter table public.client_workout_logs
add constraint client_workout_logs_exercise_order_nonnegative
check (exercise_order is null or exercise_order >= 0) not valid;

alter table public.client_workout_logs
validate constraint client_workout_logs_exercise_order_nonnegative;

comment on column public.client_workout_logs.exercise_order is
'Zero-based exercise position chosen for this workout session. Null preserves legacy code ordering.';
