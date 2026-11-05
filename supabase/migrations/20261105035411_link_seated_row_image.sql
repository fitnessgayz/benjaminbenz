-- Preserve the logged spelling while giving this exercise a readable name and reviewed image.
update public.exercise_library
set name = 'Seated Row',
    aliases = case when 'Ssated Row' = any(aliases) then aliases else array_append(aliases, 'Ssated Row') end,
    updated_at = now()
where id = '12805f0a-e226-4162-9236-2e30f0c89d24'
  and name = 'Ssated Row'
  and is_active and is_approved;

update public.client_workout_logs
set original_exercise_name = coalesce(original_exercise_name, exercise_name),
    exercise_name = 'Seated Row'
where exercise_name = 'Ssated Row';

update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from public.exercise_library as source
where target.id = '12805f0a-e226-4162-9236-2e30f0c89d24'
  and target.name = 'Seated Row'
  and target.is_active and target.is_approved and target.image_url is null
  and source.name = 'Seated Neutral Grip Row'
  and source.is_active and source.is_approved and source.image_url is not null;
