-- Match common workout-plan labels to their approved exercise-library artwork.
update public.exercise_library
set aliases = (
  select array_agg(distinct alias_value order by alias_value)
  from unnest(coalesce(aliases, '{}'::text[]) || array['Alternating Dumbbell Curl']) as alias_value
)
where lower(name) = 'dumbbell curl';

update public.exercise_library
set aliases = (
  select array_agg(distinct alias_value order by alias_value)
  from unnest(coalesce(aliases, '{}'::text[]) || array['Rear-delt fly', 'Rear delt fly']) as alias_value
)
where lower(name) = 'dumbbell reverse fly';
