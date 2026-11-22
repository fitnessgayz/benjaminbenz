-- Publish the reviewed exercise illustrations and refresh any replaced still-image loops.
do $migration$
declare
  matched_count integer;
begin
  update public.exercise_library as exercise
     set image_url = artwork.new_image,
         motion_url = artwork.new_motion,
         updated_at = case
           when exercise.image_url is distinct from artwork.new_image
             or exercise.motion_url is distinct from artwork.new_motion then now()
           else exercise.updated_at
         end
    from (values
      ('Incline Machine Chest Press - single arm side saddle', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/one-arm-incline-chest-machine-side-saddle.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/incline-machine-chest-press-single-arm-side-saddle.webp', null::text, null::text, null::text)
    ) as artwork(name, previous_image, new_image, previous_motion, new_motion, demo_url)
   where exercise.name = artwork.name
     and exercise.is_active
     and exercise.is_approved
     and exercise.demo_url is not distinct from artwork.demo_url
     and ((exercise.image_url is not distinct from artwork.previous_image
           and exercise.motion_url is not distinct from artwork.previous_motion)
       or (exercise.image_url = artwork.new_image
           and exercise.motion_url is not distinct from artwork.new_motion));

  get diagnostics matched_count = row_count;
  if matched_count <> 1 then
    raise exception 'Expected 1 unchanged or already updated exercise images, matched %', matched_count;
  end if;
end
$migration$;
