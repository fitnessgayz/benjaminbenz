update public.exercise_library
set
  aliases = array(
    select distinct alias
    from unnest(
      coalesce(aliases, '{}'::text[])
      || array[
        'Standing Cable Crunch',
        'Standing Cable Crunch - Star Trac Machine',
        'Standing Cable Crunch Star Trac',
        'Star Trac Standing Cable Crunch',
        'HumanSport Standing Cable Crunch'
      ]
    ) as alias
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/standing-cable-crunch-star-trac.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/standing-cable-crunch-star-trac.mp4',
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('Cable Crunch');

do $$
begin
  if not exists (
    select 1
    from public.exercise_library
    where lower(name) = lower('Cable Crunch')
      and 'Standing Cable Crunch - Star Trac Machine' = any(aliases)
      and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/standing-cable-crunch-star-trac.webp'
      and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/standing-cable-crunch-star-trac.mp4'
  ) then
    raise exception 'Cable Crunch was not found or Star Trac standing media was not assigned';
  end if;
end
$$;
