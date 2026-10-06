-- A client may share gym photos without writing a review. Keep ownership tied to
-- the authenticated uploader and return only their chosen nickname and avatar.
drop policy "Clients attach photos to own review" on public.gym_review_photos;
create policy "Clients add own gym photos" on public.gym_review_photos
  for insert to authenticated
  with check (user_id = (select auth.uid())
    and gym_private.gym_review_photo_owned(storage_path));

create function public.gym_photos_for_place(p_gym_id uuid)
returns table (id uuid, storage_path text, created_at timestamptz,
  nickname text, avatar_id text, is_mine boolean)
language sql stable security definer set search_path = '' as $$
  select photo.id, photo.storage_path, photo.created_at,
    coalesce(nullif(profile.display_name, ''), 'Client') as nickname,
    coalesce(profile.avatar_id, 'strength') as avatar_id,
    photo.user_id = (select auth.uid()) as is_mine
  from public.gym_review_photos photo
  left join public.client_community_profiles profile on profile.user_id = photo.user_id
  where (select auth.uid()) is not null and photo.gym_id = p_gym_id
  order by photo.created_at desc limit 100;
$$;
revoke all on function public.gym_photos_for_place(uuid) from public, anon;
grant execute on function public.gym_photos_for_place(uuid) to authenticated;

-- Equipment and amenities are client reports, not verified gym claims. Keep
-- each client's selections private while showing only combined options.
create table public.gym_place_details (
  gym_id uuid not null references public.gym_places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  equipment text[] not null default '{}',
  amenities text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (gym_id, user_id),
  check (cardinality(equipment) <= 16 and equipment <@ array[
    'free_weights', 'dumbbells', 'barbells', 'racks', 'cables', 'machines',
    'cardio', 'kettlebells', 'functional', 'boxing', 'platforms', 'bands'
  ]::text[]),
  check (cardinality(amenities) <= 16 and amenities <@ array[
    'showers', 'lockers', 'sauna', 'steam_room', 'pool', 'parking',
    'wifi', 'day_passes', 'classes', 'accessible', 'childcare',
    'open_24h', 'towels', 'personal_training'
  ]::text[])
);
alter table public.gym_place_details enable row level security;
revoke all on public.gym_place_details from public, anon, authenticated;
grant select, insert, update, delete on public.gym_place_details to authenticated;
create policy "Clients see own gym details" on public.gym_place_details
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Clients add own gym details" on public.gym_place_details
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Clients edit own gym details" on public.gym_place_details
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Clients remove own gym details" on public.gym_place_details
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.gym_features_for_place(p_gym_id uuid)
returns table (equipment text[], amenities text[], contributor_count bigint)
language sql stable security definer set search_path = '' as $$
  select
    coalesce((select array_agg(distinct value order by value)
      from public.gym_place_details detail
      cross join lateral unnest(detail.equipment) as item(value)
      where detail.gym_id = p_gym_id), '{}')::text[] as equipment,
    coalesce((select array_agg(distinct value order by value)
      from public.gym_place_details detail
      cross join lateral unnest(detail.amenities) as item(value)
      where detail.gym_id = p_gym_id), '{}')::text[] as amenities,
    (select count(*) from public.gym_place_details detail where detail.gym_id = p_gym_id)
      as contributor_count
  where (select auth.uid()) is not null;
$$;
revoke all on function public.gym_features_for_place(uuid) from public, anon;
grant execute on function public.gym_features_for_place(uuid) to authenticated;

-- A 1–5 star rating can be shared without a written tip.
alter table public.gym_reviews drop constraint gym_reviews_body_check;
alter table public.gym_reviews add constraint gym_reviews_body_check
  check (length(btrim(body)) <= 1200);
