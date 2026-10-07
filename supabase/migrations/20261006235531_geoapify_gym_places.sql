-- Keep Geoapify place identities separate from OSM and client submissions.
-- Apple Maps data is intentionally never stored in this shared directory.
alter table public.gym_places add column provider_place_id text;

alter table public.gym_places
  drop constraint gym_places_source_check,
  drop constraint gym_places_check;

alter table public.gym_places
  add constraint gym_places_source_check check (source in ('osm', 'geoapify', 'client')),
  add constraint gym_places_check check (
    (source = 'osm' and osm_type is not null and osm_id is not null
      and provider_place_id is null and created_by is null)
    or (source = 'geoapify' and osm_type is null and osm_id is null
      and provider_place_id is not null and created_by is null)
    or (source = 'client' and osm_type is null and osm_id is null
      and provider_place_id is null and created_by is not null)
  ),
  add constraint gym_places_provider_place_id_length check (
    provider_place_id is null or length(provider_place_id) between 1 and 180
  ),
  add constraint gym_places_provider_place_id_key unique (provider_place_id);

grant select (provider_place_id) on public.gym_places to authenticated;
