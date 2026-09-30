-- Reuse one approved movement demonstration across the three matching
-- Bulgarian split-squat records while keeping each exercise's distinct static
-- branded card and equipment label.
with video_targets (canonical_name, additional_aliases) as (
  values
    (
      'Bulgarian Split Squat',
      array['Rear-Foot-Elevated Split Squat', 'Rear Foot Elevated Split Squat']::text[]
    ),
    (
      'One Dumbbell Bulgarian Split Squat',
      array[
        'Bulgarian Split Squat One Arm Dumbbell',
        'Bulgarian Split Squat One-Arm Dumbbell',
        'One-Arm Dumbbell Bulgarian Split Squat'
      ]::text[]
    ),
    (
      'Two Dumbbell Bulgarian Split Squat',
      array[
        'Bulgarian Split Squat Two Arm Dumbbell',
        'Bulgarian Split Squat Two-Arm Dumbbell',
        'Two-Arm Dumbbell Bulgarian Split Squat'
      ]::text[]
    )
)
update public.exercise_library as exercise
set
  aliases = (
    select array_agg(clean_alias order by lower(clean_alias), clean_alias)
    from (
      select distinct on (lower(btrim(alias_value))) btrim(alias_value) as clean_alias
      from unnest(coalesce(exercise.aliases, '{}'::text[]) || target.additional_aliases) as alias_value
      where btrim(alias_value) <> ''
      order by lower(btrim(alias_value)), btrim(alias_value)
    ) as deduplicated_aliases
  ),
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/bulgarian-split-squat.mp4',
  updated_at = now()
from video_targets as target
where lower(exercise.name) = lower(target.canonical_name)
  and exercise.is_active
  and exercise.is_approved;
