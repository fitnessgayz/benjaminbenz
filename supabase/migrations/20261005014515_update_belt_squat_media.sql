update public.exercise_library
set
  aliases = array(
    select distinct alias
    from unnest(
      coalesce(aliases, '{}'::text[])
      || array[
        'Belt Squat Machine',
        'Machine Belt Squat',
        'Plate-Loaded Belt Squat'
      ]
    ) as alias
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-04/webp-768/belt-squat.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-04/belt-squat.mp4',
  instructions = case
    when nullif(trim(instructions), '') is null then
      'Stand securely on the platform with the belt fastened around the hips and the chain attached beneath you. Brace the trunk and use the handles only for balance. Lower under control by bending the knees and hips while keeping the feet planted and the knees tracking with the toes. Descend to a comfortable depth, then drive through the whole foot to stand tall without bouncing or locking the knees.'
    else instructions
  end,
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('Belt Squat');

do $$
begin
  if not exists (
    select 1
    from public.exercise_library
    where lower(name) = lower('Belt Squat')
      and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-04/webp-768/belt-squat.webp'
      and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-04/belt-squat.mp4'
  ) then
    raise exception 'Belt Squat was not found in exercise_library';
  end if;
end
$$;
