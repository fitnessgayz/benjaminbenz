-- Clients can schedule a fresh custom workout or repeat a completed log.
alter table public.client_workout_schedule
  drop constraint if exists client_workout_schedule_source_type_check;

alter table public.client_workout_schedule
  add constraint client_workout_schedule_source_type_check
  check (source_type in ('assigned', 'generated', 'history', 'custom'));
