-- Replace the T-Bar Row still with the supplied supported-row photo.
do $migration$
declare
  previous_image constant text := 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-01/webp-768/t-bar-row.webp';
  new_image constant text := 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/t-bar-row-photo.webp';
  matched_count integer;
begin
  update public.exercise_library
     set image_url = new_image,
         updated_at = case when image_url is distinct from new_image then now() else updated_at end
   where name = 'T-Bar Row'
     and is_approved
     and is_active
     and image_url in (previous_image, new_image);

  get diagnostics matched_count = row_count;
  if matched_count <> 1 then
    raise exception 'Expected one matching T-Bar Row exercise, found %', matched_count;
  end if;
end
$migration$;
