-- Preserve prior names as search aliases while showing one exercise card.
update public.exercise_library
set aliases = (
  select array_agg(distinct label)
  from unnest(aliases || array['90/90 hip switches', '90/90 Hip Transition']) as names(label)
)
where id = '239fb6ab-d703-41cf-a942-79c670fbcb9b';

update public.exercise_library
set is_active = false
where id in (
  '60530b94-a2ae-436a-8388-4b9ad7aa5e8f',
  '3a9ea7c6-49b8-4c78-a6c4-35a5d35cf68d'
);
