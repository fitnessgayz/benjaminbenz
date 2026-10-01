-- Use the dedicated exercise image field without changing the existing exercise metadata.
alter table public.exercise_library drop constraint exercise_library_image_url_check;

alter table public.exercise_library add constraint exercise_library_image_url_check check (
  image_url is null
  or image_url ~* '^https://qukdfjeupjhpthfbaonv[.]supabase[.]co/storage/v1/object/public/exercise-images/approved/[a-z0-9/-]+[.](jpg|jpeg|png|webp)$'
  or image_url ~* '^https://benjaminbenz[.]com/images/exercises/[a-z0-9/-]+[.](png|jpe?g|webp)$'
);

update public.exercise_library
set demo_url = null,
    image_url = 'https://benjaminbenz.com/images/exercises/hip-abduction-machine-start-end.png'
where id = 'a1f8eb80-c6d0-44a7-8e5b-237333b651df'
  and name = 'Hip Abduction Machine';
