update public.exercise_library
set
  aliases = array(
    select distinct alias
    from unnest(
      coalesce(aliases, '{}'::text[])
      || array[
        'Neutral-Grip Lat Pulldown',
        'Neutral Grip Lat Pulldown',
        'Neutral Grip Lat Pull Down',
        'Lat Pulldown Neutral Grip',
        'Lat Pull Down Neutral Grip'
      ]
    ) as alias
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/neutral-grip-lat-pulldown.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/neutral-grip-lat-pulldown.mp4',
  instructions = 'Adjust the thigh pad so the legs stay secure. Sit tall, brace the core, and hold the close neutral handle with palms facing each other. Begin with the arms extended and shoulders away from the ears. Drive the elbows down toward the ribs as you pull the handle to the upper chest without swinging or leaning farther back. Pause, then return slowly to full arm extension with control.',
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('Close-Grip Lat Pulldown');

do $$
begin
  if not exists (
    select 1
    from public.exercise_library
    where lower(name) = lower('Close-Grip Lat Pulldown')
      and 'Neutral-Grip Lat Pulldown' = any(aliases)
      and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/neutral-grip-lat-pulldown.webp'
      and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/neutral-grip-lat-pulldown.mp4'
      and instructions like 'Adjust the thigh pad so the legs stay secure.%'
  ) then
    raise exception 'Close-Grip Lat Pulldown was not found or neutral-grip media was not assigned';
  end if;
end
$$;
