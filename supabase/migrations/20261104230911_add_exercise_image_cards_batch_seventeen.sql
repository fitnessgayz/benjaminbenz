-- Link reviewed exercise image cards: 20261104230911_add_exercise_image_cards_batch_seventeen.sql.
-- Correct a library title typo while preserving the old spelling for lookup and workout history.
update public.exercise_library
set name = 'Skull Crushers Dumbbell',
    aliases = case when 'skull crushers dumbell' = any(aliases) then aliases else array_append(aliases, 'skull crushers dumbell') end,
    updated_at = now()
where id = '0a5dc9a1-4f87-4e55-80c8-0f9c7f80c0d2'
  and name = 'skull crushers dumbell'
  and is_active and is_approved;

update public.client_workout_logs
set original_exercise_name = coalesce(original_exercise_name, exercise_name),
    exercise_name = 'Skull Crushers Dumbbell'
where exercise_name = 'skull crushers dumbell';

with cards(name, slug) as (
  values
  ('Split lunge with elevated foot', 'split-lunge-with-elevated-foot'),
  ('Split Squat (hack squat machine)', 'split-squat-hack-squat-machine'),
  ('Split step → 2 shuffles → controlled stop', 'split-step-two-shuffles-controlled-stop'),
  ('Split step + lateral push-off', 'split-step-lateral-push-off'),
  ('Squat Jump', 'squat-jump'),
  ('Single-Leg Squat Touchdown', 'single-leg-squat-touchdown'),
  ('Skull Crushers Dumbbell', 'skull-crushers-dumbbell-v2'),
  ('Stability Ball Body Saw', 'stability-ball-body-saw'),
  ('Rower Intervals', 'rower-intervals'),
  ('Run Intervals', 'run-intervals')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;

with aliases(target_name, source_name) as (
  values
  ('90/90 Hip Transition', '90/90 hip switches'),
  ('Standing Calf Raise Machine', 'Standing Calf Raise')
)
update public.exercise_library as target
set image_url = source.image_url,
    updated_at = now()
from aliases
join public.exercise_library as source on source.name = aliases.source_name
where target.name = aliases.target_name
  and target.is_active and target.is_approved and target.image_url is null
  and source.is_active and source.is_approved and source.image_url is not null;

