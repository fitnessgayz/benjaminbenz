-- Restore the original Cable Crunch as the kneeling floor variation.
update public.exercise_library
set
  aliases = array(
    select distinct alias
    from unnest(
      coalesce(aliases, '{}'::text[])
      || array[
        'Kneeling Cable Crunch',
        'Cable Crunch (Kneeling)',
        'Ab Cable Crunch on Knee Pad'
      ]
    ) as alias
    where lower(alias) not in (
      'standing cable crunch',
      'standing cable crunch - star trac machine',
      'standing cable crunch star trac',
      'star trac standing cable crunch',
      'humansport standing cable crunch'
    )
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/cable-crunch.webp',
  motion_url = null,
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('Cable Crunch');

-- Give the standing Star Trac/HumanSport version its own exercise-library row.
insert into public.exercise_library (
  name,
  aliases,
  primary_muscle,
  secondary_muscles,
  equipment,
  difficulty,
  movement_pattern,
  default_sets,
  default_reps,
  default_rest_seconds,
  substitution_group,
  instructions,
  image_url,
  motion_url,
  is_approved,
  is_active,
  sort_order
)
select
  'Standing Cable Crunch (Star Trac)',
  array[
    'Standing Cable Crunch',
    'Standing Cable Crunch - Star Trac Machine',
    'Standing Cable Crunch Star Trac',
    'Star Trac Standing Cable Crunch',
    'HumanSport Standing Cable Crunch'
  ],
  'core',
  '{}'::text[],
  'cable',
  'beginner',
  'spinal_flexion',
  3,
  '10-15',
  60,
  'core_flexion',
  'Set the shoulder harness securely and stand with soft knees and the support pad behind the hips. Brace the core and hold the harness near the chest. Exhale as you curl the ribs toward the pelvis, flexing through the spine instead of only hinging at the hips. Pause, then return slowly to a tall, controlled start position.',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/standing-cable-crunch-star-trac.webp',
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/standing-cable-crunch-star-trac.mp4',
  true,
  true,
  641
where not exists (
  select 1
  from public.exercise_library
  where lower(name) = lower('Standing Cable Crunch (Star Trac)')
);

update public.exercise_library
set
  aliases = array[
    'Standing Cable Crunch',
    'Standing Cable Crunch - Star Trac Machine',
    'Standing Cable Crunch Star Trac',
    'Star Trac Standing Cable Crunch',
    'HumanSport Standing Cable Crunch'
  ],
  primary_muscle = 'core',
  equipment = 'cable',
  movement_pattern = 'spinal_flexion',
  default_reps = '10-15',
  default_rest_seconds = 60,
  substitution_group = 'core_flexion',
  instructions = 'Set the shoulder harness securely and stand with soft knees and the support pad behind the hips. Brace the core and hold the harness near the chest. Exhale as you curl the ribs toward the pelvis, flexing through the spine instead of only hinging at the hips. Pause, then return slowly to a tall, controlled start position.',
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/standing-cable-crunch-star-trac.webp',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/standing-cable-crunch-star-trac.mp4',
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = lower('Standing Cable Crunch (Star Trac)');

do $$
begin
  if not exists (
    select 1
    from public.exercise_library
    where lower(name) = lower('Cable Crunch')
      and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/cable-crunch.webp'
      and motion_url is null
      and 'Kneeling Cable Crunch' = any(aliases)
      and not ('Standing Cable Crunch' = any(aliases))
  ) then
    raise exception 'Kneeling Cable Crunch was not restored correctly';
  end if;

  if not exists (
    select 1
    from public.exercise_library
    where lower(name) = lower('Standing Cable Crunch (Star Trac)')
      and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-05/webp-768/standing-cable-crunch-star-trac.webp'
      and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-10-05/standing-cable-crunch-star-trac.mp4'
      and 'Standing Cable Crunch' = any(aliases)
  ) then
    raise exception 'Standing Cable Crunch (Star Trac) was not created correctly';
  end if;
end
$$;
