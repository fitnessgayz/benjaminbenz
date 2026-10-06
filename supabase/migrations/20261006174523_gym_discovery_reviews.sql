-- Gym directory entries are sourced from OSM or submitted by signed-in clients.
-- Exact device coordinates are never stored: only public place coordinates.
create table public.gym_places (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('osm', 'client')),
  osm_type text check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint,
  kind text not null check (kind in ('gym', 'hotel_gym')),
  name text not null check (length(btrim(name)) between 2 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text check (length(address) <= 300),
  website text check (length(website) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((source = 'osm' and osm_type is not null and osm_id is not null and created_by is null)
    or (source = 'client' and osm_type is null and osm_id is null and created_by is not null)),
  unique (osm_type, osm_id)
);
create index gym_places_coords_idx on public.gym_places (latitude, longitude);
alter table public.gym_places enable row level security;
revoke all on public.gym_places from public, anon, authenticated;
grant select, insert on public.gym_places to authenticated;
grant select, insert, update on public.gym_places to service_role;
create policy "Clients see gym places" on public.gym_places for select to authenticated
  using ((select auth.uid()) is not null);
create policy "Clients suggest a gym" on public.gym_places for insert to authenticated
  with check (source = 'client' and created_by = (select auth.uid()));

create table public.gym_reviews (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gym_places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (length(btrim(body)) between 5 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gym_id, user_id)
);
create index gym_reviews_gym_created_idx on public.gym_reviews (gym_id, created_at desc);
alter table public.gym_reviews enable row level security;
revoke all on public.gym_reviews from public, anon, authenticated;
grant select, insert, update, delete on public.gym_reviews to authenticated;
create policy "Signed-in clients see reviews" on public.gym_reviews for select to authenticated
  using ((select auth.uid()) is not null);
create policy "Clients write own reviews" on public.gym_reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Clients edit own reviews" on public.gym_reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Clients remove own reviews" on public.gym_reviews for delete to authenticated
  using (user_id = (select auth.uid()));

create table public.gym_review_photos (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gym_places(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique check (length(storage_path) between 5 and 160),
  created_at timestamptz not null default now()
);
create index gym_review_photos_gym_idx on public.gym_review_photos (gym_id, created_at desc);
alter table public.gym_review_photos enable row level security;
revoke all on public.gym_review_photos from public, anon, authenticated;
grant select, insert, delete on public.gym_review_photos to authenticated;
create policy "Signed-in clients see gym photos" on public.gym_review_photos for select to authenticated
  using ((select auth.uid()) is not null);
create policy "Clients attach photos to own review" on public.gym_review_photos for insert to authenticated
  with check (user_id = (select auth.uid()) and split_part(storage_path, '/', 1) = user_id::text and exists (
    select 1 from public.gym_reviews review
    where review.gym_id = gym_review_photos.gym_id and review.user_id = (select auth.uid())
  ));
create policy "Clients remove own gym photos" on public.gym_review_photos for delete to authenticated
  using (user_id = (select auth.uid()));

-- Return only public-facing nickname/avatar; never expose a reviewer's email or invite code.
create function public.gym_reviews_for_place(p_gym_id uuid)
returns table (id uuid, rating smallint, body text, created_at timestamptz,
  nickname text, avatar_id text, is_mine boolean, photo_paths text[])
language sql stable security definer set search_path = '' as $$
  select review.id, review.rating, review.body, review.created_at,
    coalesce(nullif(profile.display_name, ''), 'Client') as nickname,
    coalesce(profile.avatar_id, 'strength') as avatar_id,
    review.user_id = (select auth.uid()) as is_mine,
    coalesce((select array_agg(photo.storage_path order by photo.created_at)
      from public.gym_review_photos photo where photo.gym_id = review.gym_id
        and photo.user_id = review.user_id), '{}') as photo_paths
  from public.gym_reviews review
  left join public.client_community_profiles profile on profile.user_id = review.user_id
  where (select auth.uid()) is not null and review.gym_id = p_gym_id
  order by review.created_at desc limit 100;
$$;
revoke all on function public.gym_reviews_for_place(uuid) from public, anon;
grant execute on function public.gym_reviews_for_place(uuid) to authenticated;

create function public.gym_review_photo_limit() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (select count(*) from public.gym_review_photos
      where gym_id = new.gym_id and user_id = new.user_id) >= 3 then
    raise exception 'Maximum three gym photos per client and place';
  end if;
  return new;
end;
$$;
create trigger gym_review_photo_limit before insert on public.gym_review_photos
  for each row execute function public.gym_review_photo_limit();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gym-review-photos', 'gym-review-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "Signed-in clients view gym review images" on storage.objects for select to authenticated
  using (bucket_id = 'gym-review-photos' and exists (
    select 1 from public.gym_review_photos photo where photo.storage_path = name
  ));
create policy "Clients upload gym review images" on storage.objects for insert to authenticated
  with check (bucket_id = 'gym-review-photos' and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Clients remove own gym review images" on storage.objects for delete to authenticated
  using (bucket_id = 'gym-review-photos' and owner_id = (select auth.uid())::text);

-- Only the Edge Function's service role reads/writes shared location search cache.
create table public.gym_search_cache (
  cache_key text primary key,
  place_ids uuid[] not null,
  expires_at timestamptz not null
);
alter table public.gym_search_cache enable row level security;
revoke all on public.gym_search_cache from public, anon, authenticated;
grant select, insert, update on public.gym_search_cache to service_role;
