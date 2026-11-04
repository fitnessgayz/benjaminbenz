-- Correct a library title typo while preserving the old spelling for lookup and log history.
update public.exercise_library
set name = 'Close-Grip Push-Up to Failure',
    aliases = case when 'Close grip push up to failire' = any(aliases) then aliases else array_append(aliases, 'Close grip push up to failire') end,
    updated_at = now()
where id = '74b7a92b-9ed7-416c-99a6-7e457926aa41'
  and name = 'Close grip push up to failire'
  and is_active and is_approved;

update public.client_workout_logs
set original_exercise_name = coalesce(original_exercise_name, exercise_name),
    exercise_name = 'Close-Grip Push-Up to Failure'
where exercise_name = 'Close grip push up to failire';

-- Link the eleventh reviewed set of ten exercise cards.
with cards(name, slug) as (
  values
  ('Band Assisted Pull-Up', 'band-assisted-pull-up'),
  ('Chest-supported rear-delt row', 'chest-supported-rear-delt-row'),
  ('Close-Grip Push-Up to Failure', 'close-grip-push-up-to-failure'),
  ('Double-dumbbell front squat', 'double-dumbbell-front-squat'),
  ('Dumbbell Single-Leg Romanian Deadlift', 'dumbbell-single-leg-romanian-deadlift'),
  ('Front-foot-elevated reverse lunge', 'front-foot-elevated-reverse-lunge'),
  ('Cable Glute Kickback (gluteus Medius)', 'cable-glute-kickback-gluteus-medius'),
  ('Dynamic Hamstring Sweep', 'dynamic-hamstring-sweep'),
  ('Foam-Roller Wall Slide', 'foam-roller-wall-slide'),
  ('Gentle Forearm Pronation and Supination', 'gentle-forearm-pronation-and-supination')
)
update public.exercise_library as exercise
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/' || cards.slug || '.webp',
    updated_at = now()
from cards
where exercise.name = cards.name
  and exercise.is_active and exercise.is_approved and exercise.image_url is null;
