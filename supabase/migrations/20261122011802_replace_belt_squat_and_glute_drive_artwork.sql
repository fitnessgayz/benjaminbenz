-- Refresh the two still illustrations while preserving their linked videos.
do $migration$
declare
  matched_count integer;
begin
  update public.exercise_library as exercise
     set image_url = release.base_url || 'anatomy/2026-11-21/' || artwork.slug || '.webp',
         updated_at = case
           when exercise.image_url is distinct from release.base_url || 'anatomy/2026-11-21/' || artwork.slug || '.webp'
             then now()
           else exercise.updated_at
         end
    from (values
      ('Belt Squat', 'belt-squat', 'approved/2026-10-04/webp-768/belt-squat.webp'),
      ('45° Degree Glute Drive Machine', '45-degree-glute-drive-machine', 'approved/2026-10-05/webp-768/45-degree-glute-hip-drive.webp')
    ) as artwork(name, slug, previous_path)
    cross join (values (
      'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/'
    )) as release(base_url)
   where exercise.name = artwork.name
     and exercise.is_active
     and exercise.is_approved
     and exercise.image_url in (
       release.base_url || artwork.previous_path,
       release.base_url || 'anatomy/2026-11-21/' || artwork.slug || '.webp'
     );

  get diagnostics matched_count = row_count;
  if matched_count <> 2 then
    raise exception 'Expected two existing exercise images for this release, matched %', matched_count;
  end if;
end
$migration$;
