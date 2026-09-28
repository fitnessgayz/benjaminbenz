-- Unreleased: apply with the next app/web update, never infer targets for old logs.
-- Existing workout-log RLS and grants also protect this optional column.
alter table public.client_workout_logs
  add column if not exists progression_target jsonb;

alter table public.client_workout_logs
  add constraint client_workout_logs_progression_target_valid check (
    progression_target is null or coalesce((
      jsonb_typeof(progression_target) = 'object'
      and octet_length(progression_target::text) <= 4096
      and jsonb_typeof(progression_target->'enabled') = 'boolean'
      and jsonb_typeof(progression_target->'exercise_key') = 'string'
      and length(btrim(progression_target->>'exercise_key')) between 1 and 256
      and progression_target->>'unit' in ('lb', 'kg')
      and case when jsonb_typeof(progression_target->'rep_min') = 'number'
        then (progression_target->>'rep_min')::numeric between 1 and 50
          and mod((progression_target->>'rep_min')::numeric, 1) = 0 else false end
      and case when jsonb_typeof(progression_target->'rep_max') = 'number'
        then (progression_target->>'rep_max')::numeric between 1 and 50
          and mod((progression_target->>'rep_max')::numeric, 1) = 0 else false end
      and case when jsonb_typeof(progression_target->'rep_min') = 'number'
                    and jsonb_typeof(progression_target->'rep_max') = 'number'
        then (progression_target->>'rep_min')::numeric <= (progression_target->>'rep_max')::numeric else false end
      and case when jsonb_typeof(progression_target->'planned_sets') = 'number'
        then (progression_target->>'planned_sets')::numeric between 1 and 20
          and mod((progression_target->>'planned_sets')::numeric, 1) = 0 else false end
      and case when jsonb_typeof(progression_target->'target_rir') = 'number'
        then (progression_target->>'target_rir')::numeric between 0 and 5 else false end
      and case when jsonb_typeof(progression_target->'increment') = 'number'
        then (progression_target->>'increment')::numeric > 0
          and (progression_target->>'increment')::numeric <= 100 else false end
      and case when jsonb_typeof(progression_target->'required_sessions') = 'number'
        then (progression_target->>'required_sessions')::numeric between 2 and 5
          and mod((progression_target->>'required_sessions')::numeric, 1) = 0 else false end
    ), false)
  );

comment on column public.client_workout_logs.progression_target is
  'Original per-exercise progression plan for this session: exercise identity, rep range, expected working sets, effort, load unit and increment. NULL means unknown legacy target, not successful progression.';

-- An older app may omit this field on an upsert. Keep the original evidence;
-- removing unfinished sets or editing a plan must not lower the historical goal.
create or replace function public.preserve_workout_progression_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.progression_target is not null then
    new.progression_target := old.progression_target;
  end if;
  return new;
end;
$$;

revoke all on function public.preserve_workout_progression_target() from public, anon, authenticated;

create trigger preserve_workout_progression_target
before update on public.client_workout_logs
for each row execute function public.preserve_workout_progression_target();

notify pgrst, 'reload schema';
