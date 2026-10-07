-- Treat common single-arm and one-arm dumbbell-row names as the same
-- Exercise Library result without creating a second canonical movement.
update public.exercise_library
set aliases = (
  select array_agg(alias_value order by alias_value)
  from (
    select distinct on (lower(btrim(alias_value))) btrim(alias_value) as alias_value
    from unnest(
      coalesce(aliases, '{}'::text[]) || array[
        'Single-Arm Dumbbell Row',
        'Single Arm Dumbbell Row',
        'One Arm Dumbbell Row',
        'One-Arm DB Row'
      ]::text[]
    ) as alias_value
    where btrim(alias_value) <> ''
    order by lower(btrim(alias_value)), btrim(alias_value)
  ) as deduplicated_aliases
)
where lower(name) = lower('One-Arm Dumbbell Row');

do $verify$
declare
  matching_rows integer;
begin
  select count(*)
  into matching_rows
  from public.exercise_library
  where lower(name) = lower('One-Arm Dumbbell Row')
    and 'Single-Arm Dumbbell Row' = any(aliases)
    and 'One Arm Dumbbell Row' = any(aliases);

  if matching_rows <> 1 then
    raise exception 'Expected one One-Arm Dumbbell Row with both search aliases; found %', matching_rows;
  end if;
end
$verify$;
