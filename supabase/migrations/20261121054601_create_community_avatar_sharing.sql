-- A Community photo is published by an explicit save. Profile and progress
-- photo storage remains private and is never read by these functions.
create function community_private.community_avatar_owned_path(p_owner uuid, p_path text)
returns boolean
language sql immutable strict set search_path = '' as $$
  select p_path ~ ('^' || p_owner::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]jpg$');
$$;

revoke all on function community_private.community_avatar_owned_path(uuid, text) from public, anon;
grant execute on function community_private.community_avatar_owned_path(uuid, text) to authenticated;

alter table public.client_community_profiles
  add column avatar_photo_path text,
  add constraint community_avatar_photo_owned_path check (
    avatar_photo_path is null
    or community_private.community_avatar_owned_path(user_id, avatar_photo_path)
  );

create index community_avatar_published_path_idx
  on public.client_community_profiles (avatar_photo_path)
  where avatar_photo_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', false, 6291456, array['image/jpeg']);

-- Peers may download a currently selected photo. They may not list candidates,
-- create signed URLs, or read a superseded photo through this policy.
create function community_private.community_avatar_is_published(p_path text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (
      select 1 from public.client_community_profiles profile
      where profile.avatar_photo_path = p_path
    );
$$;

revoke all on function community_private.community_avatar_is_published(text) from public, anon;
grant execute on function community_private.community_avatar_is_published(text) to authenticated;

create policy "Community avatar owners can read their files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'community-avatars'
    and owner_id = (select auth.uid())::text
    and community_private.community_avatar_owned_path((select auth.uid()), name)
  );

create policy "Signed in clients can download published community avatars"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'community-avatars'
    and storage.allow_any_operation(array['object.get_authenticated', 'object.get_authenticated_info'])
    and community_private.community_avatar_is_published(name)
  );

create policy "Community avatar owners can upload fresh files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'community-avatars'
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and community_private.community_avatar_owned_path((select auth.uid()), name)
  );

create policy "Community avatar owners can delete their files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'community-avatars'
    and owner_id = (select auth.uid())::text
    and community_private.community_avatar_owned_path((select auth.uid()), name)
  );

-- Write the public nickname, fallback emoji, and selected photo together.
-- Existing column-level grants still prevent direct writes to the photo path.
create function community_private.community_save_avatar_profile(
  p_display_name text,
  p_avatar_id text,
  p_avatar_photo_path text
)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  saved_path text;
begin
  if actor is null or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'false' then
    raise exception 'Sign in to edit your Community profile' using errcode = '42501';
  end if;

  if p_avatar_photo_path is not null and (
    not community_private.community_avatar_owned_path(actor, p_avatar_photo_path)
    or not exists (
      select 1 from storage.objects photo
      where photo.bucket_id = 'community-avatars'
        and photo.name = p_avatar_photo_path
        and photo.owner_id = actor::text
    )
  ) then
    raise exception 'Choose a photo you uploaded to Community' using errcode = '42501';
  end if;

  insert into public.client_community_profiles as profile (
    user_id, display_name, avatar_id, avatar_photo_path
  )
  values (actor, btrim(p_display_name), p_avatar_id, p_avatar_photo_path)
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        avatar_id = excluded.avatar_id,
        avatar_photo_path = excluded.avatar_photo_path
  returning profile.avatar_photo_path into saved_path;
  return saved_path;
end;
$$;

create function public.community_save_avatar_profile(
  p_display_name text,
  p_avatar_id text,
  p_avatar_photo_path text
)
returns text
language sql security invoker set search_path = '' as $$
  select community_private.community_save_avatar_profile(p_display_name, p_avatar_id, p_avatar_photo_path);
$$;

revoke all on function community_private.community_save_avatar_profile(text, text, text) from public, anon;
revoke all on function public.community_save_avatar_profile(text, text, text) from public, anon;
grant execute on function community_private.community_save_avatar_profile(text, text, text) to authenticated;
grant execute on function public.community_save_avatar_profile(text, text, text) to authenticated;

-- Return only the explicitly shared path for requested members. This response
-- contains no invite code, private profile data, or unpublished candidate files.
create function community_private.community_avatar_paths(p_user_ids uuid[])
returns table (user_id uuid, avatar_photo_path text)
language sql stable security definer set search_path = '' as $$
  select profile.user_id, profile.avatar_photo_path
  from public.client_community_profiles profile
  where (select auth.uid()) is not null
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and cardinality(p_user_ids) between 1 and 101
    and profile.user_id = any(p_user_ids)
    and profile.avatar_photo_path is not null;
$$;

create function public.community_avatar_paths(p_user_ids uuid[])
returns table (user_id uuid, avatar_photo_path text)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_avatar_paths(p_user_ids);
$$;

revoke all on function community_private.community_avatar_paths(uuid[]) from public, anon;
revoke all on function public.community_avatar_paths(uuid[]) from public, anon;
grant execute on function community_private.community_avatar_paths(uuid[]) to authenticated;
grant execute on function public.community_avatar_paths(uuid[]) to authenticated;
