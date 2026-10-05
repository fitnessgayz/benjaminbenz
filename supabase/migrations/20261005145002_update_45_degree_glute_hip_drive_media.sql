update public.exercise_library
set
  aliases = array(
    select distinct alias
    from unnest(
      coalesce(aliases, '{}'::text[])
      || array[
        '45 Degree Glute Drive Machine',
        '45° Glute Hip Drive',
        '45 Degree Glute Hip Drive',
        '45-Degree Glute Hip Drive'
      ]
    ) as alias
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/45-degree-glute-hip-drive.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/45-degree-glute-hip-drive.mp4',
  instructions = 'Set the thigh pad just below the hip crease. Stand shoulder-width with feet flat and toes turned out about 45°. Tuck the chin and keep the upper back gently rounded. Hinge slowly at the hips until the glutes and hamstrings stretch, then drive the hips into the pad and squeeze the glutes to return until the torso aligns with the legs. Stop there—do not arch or hyperextend the lower back.',
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('45° Degree Glute Drive Machine');

do $$
begin
  if not exists (
    select 1
    from public.exercise_library
    where lower(name) = lower('45° Degree Glute Drive Machine')
      and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/45-degree-glute-hip-drive.webp'
      and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/45-degree-glute-hip-drive.mp4'
      and instructions like 'Set the thigh pad just below the hip crease.%'
  ) then
    raise exception '45° Degree Glute Drive Machine was not found in exercise_library';
  end if;
end
$$;
