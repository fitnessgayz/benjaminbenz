-- Keep the shared exercise record intact while allowing its trusted, static demo image.
alter table public.exercise_library drop constraint exercise_library_demo_url_check;

alter table public.exercise_library add constraint exercise_library_demo_url_check check (
  demo_url is null
  or demo_url ~* '^https://(www[.])?(youtube[.]com|youtu[.]be)/'
  or demo_url ~* '^https://qukdfjeupjhpthfbaonv[.]supabase[.]co/storage/v1/object/public/exercise-videos/[a-z0-9/-]+[.](mp4|mov|m4v|webm)$'
  or demo_url ~* '^https://benjaminbenz[.]com/images/exercises/[a-z0-9/-]+[.](png|jpe?g|webp)$'
);

update public.exercise_library
set demo_url = 'https://benjaminbenz.com/images/exercises/hip-abduction-machine-start-end.png'
where id = 'a1f8eb80-c6d0-44a7-8e5b-237333b651df'
  and name = 'Hip Abduction Machine';
