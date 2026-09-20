-- Exercise demos are shareable media. Only the coach may upload or delete;
-- progress photos and client form-check videos stay in their private buckets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-videos', 'exercise-videos', true, 52428800,
  array['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm']
);

create policy "Coach can upload exercise videos"
on storage.objects for insert to authenticated
with check (bucket_id = 'exercise-videos' and (select public.is_coach_admin()));

create policy "Coach can inspect exercise videos"
on storage.objects for select to authenticated
using (bucket_id = 'exercise-videos' and (select public.is_coach_admin()));

create policy "Coach can delete exercise videos"
on storage.objects for delete to authenticated
using (bucket_id = 'exercise-videos' and (select public.is_coach_admin()));

-- Uploads use unique paths (no overwrite/update access is needed).
alter table public.exercise_library drop constraint exercise_library_demo_url_check;
alter table public.exercise_library add constraint exercise_library_demo_url_check check (
  demo_url is null
  or demo_url ~* '^https://(www[.])?(youtube[.]com|youtu[.]be)/'
  or demo_url ~* '^https://qukdfjeupjhpthfbaonv[.]supabase[.]co/storage/v1/object/public/exercise-videos/[a-z0-9/-]+[.](mp4|mov|m4v|webm)$'
);
