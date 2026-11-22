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
      ('Dumbbell Wolverine', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-09/webp-768/dumbbell-wolverine.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/dumbbell-wolverine.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/dumbbell-wolverine.mp4', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/dumbbell-wolverine.mp4', null::text),
      ('Glute Machine Bulgarian Split Squat', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-04/webp-768/glute-squat-machine-bulgarian-split-squat.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/glute-machine-bulgarian-split-squat.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-04/glute-squat-machine-bulgarian-split-squat.mp4', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-04/glute-squat-machine-bulgarian-split-squat.mp4', null::text),
      ('Belt Squat RDL', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/belt-squat-rdl.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/belt-squat-rdl.webp', null::text, null::text, null::text),
      ('Decline cable chest press', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/decline-cable-chest-press.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/decline-cable-chest-press.webp', null::text, null::text, null::text),
      ('Chest-Supported Dumbbell Wide Row', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-07/webp-768/chest-supported-dumbbell-wide-row.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/chest-supported-dumbbell-wide-row.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/chest-supported-dumbbell-wide-row.mp4', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-07/chest-supported-dumbbell-wide-row.mp4', null::text),
      ('Inner Chest Press', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-09/webp-768/inner-chest-press.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/inner-chest-press.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/inner-chest-press.mp4', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-09/inner-chest-press.mp4', null::text),
      ('lat pull neutral grip', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/lat-pull-neutral-grip.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/lat-pull-neutral-grip.webp', null::text, null::text, null::text),
      ('Lat pull down wide neutral grip', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/lat-pull-down-wide-neutral-grip.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/lat-pull-down-wide-neutral-grip.webp', null::text, null::text, null::text)
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
  if matched_count <> 8 then
    raise exception 'Expected 8 unchanged or already updated exercise images, matched %', matched_count;
  end if;
end
$migration$;
