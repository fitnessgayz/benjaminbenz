update public.exercise_library
set
  aliases = array(
    select distinct alias
    from unnest(
      coalesce(aliases, '{}'::text[])
      || array[
        'Glute Squat Machine Bulgarian Split Squat',
        'Glute Squat Bulgarian Split Squat',
        'Machine Bulgarian Split Squat',
        'Glute Builder Bulgarian Split Squat'
      ]
    ) as alias
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-04/webp-768/glute-squat-machine-bulgarian-split-squat.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-04/glute-squat-machine-bulgarian-split-squat.mp4',
  instructions = case
    when nullif(trim(instructions), '') is null then
      'Position the working foot securely on the platform and the rear foot on the support roller. Brace your trunk beneath the shoulder pad and keep the hips square. Lower under control by bending the working knee and hip, keeping the front foot planted and the knee tracking with the toes. Drive through the working foot to return to the start without bouncing or locking the knee.'
    else instructions
  end,
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('Glute Machine Bulgarian Split Squat');

do $$
begin
  if not exists (
    select 1
    from public.exercise_library
    where lower(name) = lower('Glute Machine Bulgarian Split Squat')
      and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-04/webp-768/glute-squat-machine-bulgarian-split-squat.webp'
      and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-04/glute-squat-machine-bulgarian-split-squat.mp4'
  ) then
    raise exception 'Glute Machine Bulgarian Split Squat was not found in exercise_library';
  end if;
end
$$;
