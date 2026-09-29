-- Keep list views lightweight with image_url while loading motion only after
-- the client explicitly opens an exercise demo.
alter table public.exercise_library
add column if not exists motion_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exercise_library_motion_url_check'
      and conrelid = 'public.exercise_library'::regclass
  ) then
    alter table public.exercise_library
    add constraint exercise_library_motion_url_check check (
      motion_url is null
      or motion_url ~* '^https://qukdfjeupjhpthfbaonv[.]supabase[.]co/storage/v1/object/public/exercise-images/approved/[a-z0-9/-]+[.]webp$'
      or motion_url ~* '^https://benjaminbenz[.]com/images/exercises/[a-z0-9/-]+[.]webp$'
    );
  end if;
end
$$;

comment on column public.exercise_library.motion_url is
  'Optional animated WebP loaded only after a user opens the exercise image.';
