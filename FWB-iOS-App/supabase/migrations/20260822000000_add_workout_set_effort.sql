-- Add optional, per-set effort tracking without changing existing workout rows.
-- This migration is intentionally committed for review and must be applied
-- separately before RPE/RIR values can sync between the iOS app and website.

alter table public.client_workout_logs
  add column if not exists effort_scale text,
  add column if not exists effort_value numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_workout_logs_effort_pair_check'
      and conrelid = 'public.client_workout_logs'::regclass
  ) then
    alter table public.client_workout_logs
      add constraint client_workout_logs_effort_pair_check
      check (
        (effort_scale is null and effort_value is null)
        or (effort_scale = 'rpe' and effort_value between 1 and 10)
        or (effort_scale = 'rir' and effort_value between 0 and 10)
      );
  end if;
end
$$;

comment on column public.client_workout_logs.effort_scale is
  'Optional client-selected effort scale: rpe or rir.';

comment on column public.client_workout_logs.effort_value is
  'Optional per-set effort value. RPE accepts 1-10; RIR accepts 0-10.';
