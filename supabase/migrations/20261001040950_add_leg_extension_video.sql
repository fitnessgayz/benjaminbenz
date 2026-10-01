-- Use the approved user-supplied clip for both the in-app motion player and
-- legacy demo actions, preventing a generated YouTube link from taking over.
update public.exercise_library
set
  demo_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/leg-extension.mp4',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/leg-extension.mp4',
  updated_at = now()
where lower(name) = 'leg extension'
  and is_active
  and is_approved;
