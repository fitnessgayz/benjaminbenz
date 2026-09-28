-- Approved exercise artwork is public client-facing media. Only the coach may
-- manage the originals; clients receive stable public URLs from the catalog.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-images', 'exercise-images', true, 8388608,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "Coach can upload exercise images"
on storage.objects for insert to authenticated
with check (bucket_id = 'exercise-images' and (select public.is_coach_admin()));

create policy "Coach can inspect exercise images"
on storage.objects for select to authenticated
using (bucket_id = 'exercise-images' and (select public.is_coach_admin()));

create policy "Coach can update exercise images"
on storage.objects for update to authenticated
using (bucket_id = 'exercise-images' and (select public.is_coach_admin()))
with check (bucket_id = 'exercise-images' and (select public.is_coach_admin()));

create policy "Coach can delete exercise images"
on storage.objects for delete to authenticated
using (bucket_id = 'exercise-images' and (select public.is_coach_admin()));

alter table public.exercise_library
add column image_url text;

alter table public.exercise_library
add constraint exercise_library_image_url_check check (
  image_url is null
  or image_url ~* '^https://qukdfjeupjhpthfbaonv[.]supabase[.]co/storage/v1/object/public/exercise-images/approved/[a-z0-9/-]+[.](jpg|jpeg|png|webp)$'
);

insert into public.exercise_library (
  name,
  aliases,
  primary_muscle,
  equipment,
  difficulty,
  movement_pattern,
  default_sets,
  default_reps,
  default_rest_seconds,
  substitution_group,
  image_url,
  is_approved,
  is_active,
  sort_order
)
values (
  'Glute Kickback Machine',
  array['Machine Glute Kickback'],
  'glutes',
  'machine',
  'beginner',
  'hip_extension',
  3,
  '12-15 each',
  60,
  'hip_extension',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/glute-kickback-machine.png',
  true,
  true,
  525
)
on conflict (lower(name)) do update set
  aliases = excluded.aliases,
  primary_muscle = excluded.primary_muscle,
  equipment = excluded.equipment,
  difficulty = excluded.difficulty,
  movement_pattern = excluded.movement_pattern,
  default_sets = excluded.default_sets,
  default_reps = excluded.default_reps,
  default_rest_seconds = excluded.default_rest_seconds,
  substitution_group = excluded.substitution_group,
  image_url = excluded.image_url,
  is_approved = excluded.is_approved,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();
