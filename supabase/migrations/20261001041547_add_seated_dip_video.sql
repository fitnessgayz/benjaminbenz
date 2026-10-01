-- Attach the user-supplied machine dip clip to both modern motion playback and
-- legacy demo actions, and preserve the shorter workout label as an alias.
update public.exercise_library
set
  aliases = (
    select array_agg(clean_alias order by lower(clean_alias), clean_alias)
    from (
      select distinct on (lower(btrim(alias_value))) btrim(alias_value) as clean_alias
      from unnest(coalesce(aliases, '{}'::text[]) || array['Seated Dip', 'Machine Seated Dip']) as alias_value
      where btrim(alias_value) <> ''
      order by lower(btrim(alias_value)), btrim(alias_value)
    ) as deduplicated_aliases
  ),
  demo_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/seated-dip-machine.mp4',
  motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/seated-dip-machine.mp4',
  updated_at = now()
where lower(name) = 'seated dip machine'
  and is_active
  and is_approved;
