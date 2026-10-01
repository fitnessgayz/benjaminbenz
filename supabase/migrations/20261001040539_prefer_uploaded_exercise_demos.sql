-- A later NASM catalog import restored a YouTube demo URL for the canonical
-- Bulgarian split squat. Keep both legacy demo actions and the richer motion
-- player on the user-supplied, versioned video instead.
update public.exercise_library
set
  demo_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/bulgarian-split-squat.mp4',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/bulgarian-split-squat.mp4',
  updated_at = now()
where lower(name) in (
  'bulgarian split squat',
  'one dumbbell bulgarian split squat',
  'two dumbbell bulgarian split squat'
)
  and is_active
  and is_approved;
