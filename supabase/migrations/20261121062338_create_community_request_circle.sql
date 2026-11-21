-- Request an existing Community connection from a visible Social profile.
-- This path never reads or returns the recipient's invite code.
alter table public.client_community_connections
  add column request_source text not null default 'invite_code'
  check (request_source in ('invite_code', 'circle'));

-- On the new path, a sender has not been given the recipient's invite code.
-- Keep legacy invite and approved connection access as it was.
alter policy "Community profiles visible only to participants" on public.client_community_profiles
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.client_community_connections connection
      where ((connection.user_a = (select auth.uid()) and connection.user_b = user_id)
          or (connection.user_b = (select auth.uid()) and connection.user_a = user_id))
        and (
          connection.status = 'accepted'
          or connection.request_source = 'invite_code'
          or connection.requested_by <> (select auth.uid())
        )
    )
  );

create function community_private.community_request_circle(p_member_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  pair_a uuid;
  pair_b uuid;
  connection_id uuid;
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true'
    or not exists (select 1 from public.client_community_profiles profile where profile.user_id = actor) then
    raise exception using errcode = '42501', message = 'Join Community before sending a Circle request.';
  end if;

  if p_member_id is null or p_member_id = actor then
    raise exception using errcode = '42501', message = 'This member is not available for Circle requests.';
  end if;

  pair_a := least(actor, p_member_id);
  pair_b := greatest(actor, p_member_id);

  select connection.id into connection_id
  from public.client_community_connections connection
  where connection.user_a = pair_a and connection.user_b = pair_b;
  if connection_id is not null then
    return connection_id;
  end if;

  -- The feed supplies the visible set, and the internal projection supplies
  -- the authoritative owner without parsing event IDs or exposing profiles.
  if not exists (
    select 1
    from community_private.community_wall_feed() visible
    join community_private.community_wall_events() event on event.event_id = visible.event_id
    where event.owner_id = p_member_id
      and visible.occurred_at between now() - interval '72 hours' and now()
  ) then
    raise exception using errcode = '42501', message = 'This member is not available for Circle requests.';
  end if;

  insert into public.client_community_connections (user_a, user_b, requested_by, request_source)
  values (pair_a, pair_b, actor, 'circle')
  on conflict (user_a, user_b) do nothing
  returning id into connection_id;

  if connection_id is null then
    -- A concurrent request won the same pair. Preserve its sender and status.
    select connection.id into connection_id
    from public.client_community_connections connection
    where connection.user_a = pair_a and connection.user_b = pair_b;
  end if;
  if connection_id is null then
    raise exception using errcode = '42501', message = 'This member is not available for Circle requests.';
  end if;
  return connection_id;
exception
  when foreign_key_violation then
    raise exception using errcode = '42501', message = 'This member is not available for Circle requests.';
end;
$$;

revoke all on function community_private.community_request_circle(uuid) from public, anon, authenticated;
grant execute on function community_private.community_request_circle(uuid) to authenticated;

create function public.community_request_circle(p_member_id uuid)
returns uuid
language sql security invoker set search_path = '' as $$
  select community_private.community_request_circle(p_member_id);
$$;

revoke all on function public.community_request_circle(uuid) from public, anon, authenticated;
grant execute on function public.community_request_circle(uuid) to authenticated;

-- Both participants can display the peer's public Community identity in the
-- Circles list, including when their raw profile row is hidden.
create function community_private.community_connection_peer_profiles()
returns table (user_id uuid, display_name text, avatar_id text)
language sql stable security definer set search_path = '' as $$
  with caller as (
    select auth.uid() as id
    where (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  )
  select profile.user_id, profile.display_name, profile.avatar_id
  from caller
  join public.client_community_connections connection on caller.id in (connection.user_a, connection.user_b)
  join public.client_community_profiles profile
    on profile.user_id = case when caller.id = connection.user_a then connection.user_b else connection.user_a end;
$$;

revoke all on function community_private.community_connection_peer_profiles() from public, anon, authenticated;
grant execute on function community_private.community_connection_peer_profiles() to authenticated;

create function public.community_connection_peer_profiles()
returns table (user_id uuid, display_name text, avatar_id text)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_connection_peer_profiles();
$$;

revoke all on function public.community_connection_peer_profiles() from public, anon, authenticated;
grant execute on function public.community_connection_peer_profiles() to authenticated;
