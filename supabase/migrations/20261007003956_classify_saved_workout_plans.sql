-- Weekly generated programs and single generated sessions share the saved-plan
-- table. The discriminator lets the client decode each stored snapshot safely.
alter table public.client_saved_workout_plans
  add column plan_kind text not null default 'session'
  check (plan_kind in ('session', 'program'));
