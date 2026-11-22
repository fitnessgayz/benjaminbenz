-- Remove one-off labels from new exercise selection. Keep the original rows
-- and any workout history that uses their names.
do $migration$
declare
  retired record;
begin
  for retired in
    select *
    from (values
      ('4689e5e9-a7ad-440c-9951-d65d81ab135b'::uuid, 'Biking from caltrain'),
      ('4272a3e1-0a84-469b-bc32-8e8e1d943d58'::uuid, 'EZ-bar or dumbbell curl'),
      ('1571d2c0-1569-4d7e-b2a2-304c5df02967'::uuid, 'Lateral shuffle → controlled stop'),
      ('e334b8f9-8df7-453d-81a5-a75b53dba293'::uuid, 'Split step → 2 shuffles → controlled stop'),
      ('55573462-df49-4343-a3b4-b9dd9fbd8e9b'::uuid, 'Split step + lateral push-off'),
      ('b6796fe2-7542-49d7-b124-6d5ee8b4aaa5'::uuid, 'Super incoming dumbbell chest press')
    ) as exercises(id, name)
  loop
    if not exists (
      select 1 from public.exercise_library where id = retired.id and name = retired.name
    ) then
      raise exception 'Exercise retirement precondition failed for %', retired.name;
    end if;

    update public.exercise_library
    set is_active = false, updated_at = now()
    where id = retired.id and name = retired.name and is_active;
  end loop;
end
$migration$;
