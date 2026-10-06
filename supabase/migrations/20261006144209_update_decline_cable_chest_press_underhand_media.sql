update public.exercise_library
set
  aliases = array(
    select distinct alias
    from unnest(
      coalesce(aliases, '{}'::text[])
      || array[
        'Decline Cable Chest Press - Underhand',
        'Decline Cable Chest Press Underhand',
        'Underhand Decline Cable Chest Press',
        'Supinated Decline Cable Chest Press',
        'Star Trac Decline Cable Chest Press'
      ]
    ) as alias
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-06/webp-768/decline-cable-chest-press-underhand.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-06/decline-cable-chest-press-underhand.mp4',
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('Decline Chest Press');

do $$
begin
  if not exists (
    select 1
    from public.exercise_library
    where lower(name) = lower('Decline Chest Press')
      and 'Decline Cable Chest Press - Underhand' = any(aliases)
      and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-06/webp-768/decline-cable-chest-press-underhand.webp'
      and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-06/decline-cable-chest-press-underhand.mp4'
  ) then
    raise exception 'Decline Chest Press was not found or underhand cable media was not assigned';
  end if;
end
$$;
