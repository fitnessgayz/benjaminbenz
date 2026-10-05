-- Community is opt-in. A profile is created only when a client joins.
-- Existing workout, health, and account tables are never shared by these policies.
create table public.client_community_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
  created_at timestamptz not null default now()
);

create table public.client_community_connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.client_community_profiles(user_id) on delete cascade,
  user_b uuid not null references public.client_community_profiles(user_id) on delete cascade,
  requested_by uuid not null references public.client_community_profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);
create index client_community_connections_user_b_idx on public.client_community_connections(user_b);

-- This table contains a deliberately small projection, not workout records.
-- Rankings are out of scope: client-supplied XP must not be used as an authoritative leaderboard.
create table public.client_community_achievements (
  user_id uuid primary key references public.client_community_profiles(user_id) on delete cascade,
  xp integer not null check (xp between 0 and 100000000),
  badge_ids text[] not null default '{}' check (cardinality(badge_ids) <= 32),
  updated_at timestamptz not null default now()
);

alter table public.client_community_profiles enable row level security;
alter table public.client_community_connections enable row level security;
alter table public.client_community_achievements enable row level security;

revoke all on public.client_community_profiles from anon, authenticated;
revoke all on public.client_community_connections from anon, authenticated;
revoke all on public.client_community_achievements from anon, authenticated;
grant select, delete on public.client_community_profiles to authenticated;
grant insert (user_id, display_name), update (display_name) on public.client_community_profiles to authenticated;
grant select on public.client_community_connections to authenticated;
grant select, delete on public.client_community_achievements to authenticated;
grant insert (user_id, xp, badge_ids), update (xp, badge_ids, updated_at) on public.client_community_achievements to authenticated;

create policy "Community profiles visible only to participants"
  on public.client_community_profiles for select to authenticated
  using (
    user_id = (select auth.uid()) or exists (
      select 1 from public.client_community_connections c
      where (c.user_a = (select auth.uid()) and c.user_b = user_id)
         or (c.user_b = (select auth.uid()) and c.user_a = user_id)
    )
  );
create policy "Clients join community themselves"
  on public.client_community_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Clients update their own community name"
  on public.client_community_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Clients leave community themselves"
  on public.client_community_profiles for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Connection participants can read invitations"
  on public.client_community_connections for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- The achievement policy below must be able to see a connection's opt-in flag.
-- The existing preferences policy still lets each owner read their own row.
create policy "Accepted connections read sharing choices"
  on public.client_community_preferences for select to authenticated
  using (exists (
    select 1 from public.client_community_connections c
    where c.status = 'accepted'
      and ((c.user_a = (select auth.uid()) and c.user_b = user_id)
        or (c.user_b = (select auth.uid()) and c.user_a = user_id))
  ));

create policy "Achievement owner or permitted connection can read"
  on public.client_community_achievements for select to authenticated
  using (
    user_id = (select auth.uid()) or (
      exists (select 1 from public.client_community_preferences p
              where p.user_id = client_community_achievements.user_id and p.badges_opt_in)
      and exists (
        select 1 from public.client_community_connections c
        where c.status = 'accepted'
          and ((c.user_a = (select auth.uid()) and c.user_b = user_id)
            or (c.user_b = (select auth.uid()) and c.user_a = user_id))
      )
    )
  );
create policy "Clients insert their own shared achievements"
  on public.client_community_achievements for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Clients update their own shared achievements"
  on public.client_community_achievements for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Clients remove their own shared achievements"
  on public.client_community_achievements for delete to authenticated
  using (user_id = (select auth.uid()));

-- Only narrow, authenticated RPCs can create or change a connection. The
-- security-definer implementations live outside the exposed Data API schema.
create schema if not exists community_private;
grant usage on schema community_private to authenticated;

create function community_private.community_request_connection(p_invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  target uuid;
  result uuid;
begin
  if actor is null or not exists (select 1 from public.client_community_profiles where user_id = actor) then
    raise exception 'Join Community before sending an invitation';
  end if;
  select user_id into target from public.client_community_profiles
    where invite_code = upper(btrim(p_invite_code)) and user_id <> actor;
  if target is null then raise exception 'Invite code not found'; end if;
  if exists (select 1 from public.client_community_connections
             where user_a = least(actor, target) and user_b = greatest(actor, target)) then
    raise exception 'A connection or invitation already exists';
  end if;
  insert into public.client_community_connections (user_a, user_b, requested_by)
    values (least(actor, target), greatest(actor, target), actor)
    returning id into result;
  return result;
end;
$$;

create function community_private.community_accept_connection(p_connection_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then return false; end if;
  update public.client_community_connections set status = 'accepted', accepted_at = now()
    where id = p_connection_id and status = 'pending'
      and actor in (user_a, user_b) and requested_by <> actor;
  return found;
end;
$$;

create function community_private.community_remove_connection(p_connection_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then return false; end if;
  delete from public.client_community_connections
    where id = p_connection_id and actor in (user_a, user_b);
  return found;
end;
$$;

create function community_private.community_rotate_invite_code()
returns text language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); result text;
begin
  if actor is null then raise exception 'Sign in to Community'; end if;
  update public.client_community_profiles
    set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
    where user_id = actor returning invite_code into result;
  if result is null then raise exception 'Join Community first'; end if;
  return result;
end;
$$;

revoke all on function community_private.community_request_connection(text) from public, anon;
revoke all on function community_private.community_accept_connection(uuid) from public, anon;
revoke all on function community_private.community_remove_connection(uuid) from public, anon;
revoke all on function community_private.community_rotate_invite_code() from public, anon;
grant execute on function community_private.community_request_connection(text) to authenticated;
grant execute on function community_private.community_accept_connection(uuid) to authenticated;
grant execute on function community_private.community_remove_connection(uuid) to authenticated;
grant execute on function community_private.community_rotate_invite_code() to authenticated;

create function public.community_request_connection(p_invite_code text)
returns uuid language sql security invoker set search_path = '' as $$
  select community_private.community_request_connection(p_invite_code);
$$;
create function public.community_accept_connection(p_connection_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select community_private.community_accept_connection(p_connection_id);
$$;
create function public.community_remove_connection(p_connection_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select community_private.community_remove_connection(p_connection_id);
$$;
create function public.community_rotate_invite_code()
returns text language sql security invoker set search_path = '' as $$
  select community_private.community_rotate_invite_code();
$$;
revoke all on function public.community_request_connection(text) from public, anon;
revoke all on function public.community_accept_connection(uuid) from public, anon;
revoke all on function public.community_remove_connection(uuid) from public, anon;
revoke all on function public.community_rotate_invite_code() from public, anon;
grant execute on function public.community_request_connection(text) to authenticated;
grant execute on function public.community_accept_connection(uuid) to authenticated;
grant execute on function public.community_remove_connection(uuid) to authenticated;
grant execute on function public.community_rotate_invite_code() to authenticated;
