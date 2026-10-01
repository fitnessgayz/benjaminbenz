alter table public.exercise_library
drop constraint if exists exercise_library_motion_url_check;

alter table public.exercise_library
add constraint exercise_library_motion_url_check check (
  motion_url is null
  or motion_url ~* '^https://qukdfjeupjhpthfbaonv[.]supabase[.]co/storage/v1/object/public/exercise-images/approved/[a-z0-9/-]+[.]webp$'
  or motion_url ~* '^https://qukdfjeupjhpthfbaonv[.]supabase[.]co/storage/v1/object/public/exercise-videos/generated/[a-z0-9/-]+[.]mp4$'
  or motion_url ~* '^https://benjaminbenz[.]com/images/exercises/[a-z0-9/-]+[.]webp$'
);

comment on column public.exercise_library.motion_url is
  'Optional first-party animated WebP or silent MP4 loaded only after a user opens the exercise image.';
