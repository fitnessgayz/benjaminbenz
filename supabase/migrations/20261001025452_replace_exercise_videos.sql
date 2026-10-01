-- Move the affected exercises to the user-supplied, versioned movement demos.
-- Published Storage objects are immutable, so replacements use new paths.
with video_targets (exercise_name, motion_url) as (
  values
    (
      'Barbell Upright Row',
      'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/upright-row.mp4'
    ),
    (
      'Upright Row',
      'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/upright-row.mp4'
    ),
    (
      'Incline Dumbbell Curl',
      'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/incline-dumbbell-curl.mp4'
    ),
    (
      'Bulgarian Split Squat',
      'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/bulgarian-split-squat.mp4'
    ),
    (
      'One Dumbbell Bulgarian Split Squat',
      'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/bulgarian-split-squat.mp4'
    ),
    (
      'Two Dumbbell Bulgarian Split Squat',
      'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/bulgarian-split-squat.mp4'
    )
)
update public.exercise_library as exercise
set
  motion_url = target.motion_url,
  updated_at = now()
from video_targets as target
where lower(exercise.name) = lower(target.exercise_name)
  and exercise.is_active
  and exercise.is_approved;
