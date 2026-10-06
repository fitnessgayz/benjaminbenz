-- Accepted connections may privately challenge one another for seven days.
-- Counts come from completed sessions and check-ins, never client-uploaded XP.
create table community_private.client_community_challenges (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.client_community_connections(id) on delete cascade,
  initiator_id uuid not null references public.client_community_profiles(user_id) on delete cascade,
  recipient_id uuid not null references public.client_community_profiles(user_id) on delete cascade,
  metric text not null check (metric in ('workouts', 'gym_visits')),
  target_count integer not null check (target_count between 1 and 7),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  ends_at timestamptz,
  check (initiator_id <> recipient_id),
  check ((status = 'accepted') = (accepted_at is not null and ends_at is not null))
);
create index client_community_challenges_connection_idx
  on community_private.client_community_challenges(connection_id, created_at desc);
alter table community_private.client_community_challenges enable row level security;
revoke all on community_private.client_community_challenges from public, anon, authenticated;

create function community_private.community_create_challenge(
  p_connection_id uuid, p_metric text, p_target_count integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  peer uuid;
  created_id uuid;
begin
  if actor is null or (select public.is_coach_admin()) then
    raise exception 'Sign in as a client';
  end if;
  if p_metric is null or p_metric not in ('workouts', 'gym_visits')
     or p_target_count is null or p_target_count not between 1 and 7 then
    raise exception 'Choose a valid weekly goal';
  end if;
  select case when c.user_a = actor then c.user_b else c.user_a end into peer
    from public.client_community_connections c
    where c.id = p_connection_id and c.status = 'accepted'
      and actor in (c.user_a, c.user_b)
    for update of c;
  if peer is null then raise exception 'Connect before sending a challenge'; end if;
  if exists (
    select 1 from community_private.client_community_challenges challenge
    where challenge.connection_id = p_connection_id and challenge.metric = p_metric
      and (challenge.status = 'pending'
        or (challenge.status = 'accepted' and challenge.ends_at > now()))
  ) then raise exception 'An active challenge already exists for this goal'; end if;
  insert into community_private.client_community_challenges
    (connection_id, initiator_id, recipient_id, metric, target_count)
    values (p_connection_id, actor, peer, p_metric, p_target_count)
    returning id into created_id;
  return created_id;
end;
$$;

create function community_private.community_accept_challenge(p_challenge_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or (select public.is_coach_admin()) then return false; end if;
  update community_private.client_community_challenges challenge
    set status = 'accepted', accepted_at = now(), ends_at = now() + interval '7 days'
    from public.client_community_connections connection
    where challenge.id = p_challenge_id and challenge.status = 'pending'
      and challenge.recipient_id = actor
      and connection.id = challenge.connection_id and connection.status = 'accepted'
      and actor in (connection.user_a, connection.user_b);
  return found;
end;
$$;

create function community_private.community_cancel_challenge(p_challenge_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then return false; end if;
  update community_private.client_community_challenges
    set status = 'cancelled', accepted_at = null, ends_at = null
    where id = p_challenge_id and status in ('pending', 'accepted')
      and actor in (initiator_id, recipient_id);
  return found;
end;
$$;

create function community_private.community_challenge_summary()
returns table (
  id uuid,
  metric text,
  target_count integer,
  status text,
  peer_nickname text,
  peer_avatar_id text,
  incoming boolean,
  accepted_at timestamptz,
  ends_at timestamptz,
  my_count integer,
  peer_count integer
)
language sql stable security definer set search_path = '' as $$
  with actor as (select auth.uid() as user_id)
  select challenge.id, challenge.metric, challenge.target_count, challenge.status,
    peer.display_name, peer.avatar_id,
    challenge.recipient_id = actor.user_id,
    challenge.accepted_at, challenge.ends_at,
    case when challenge.status = 'accepted' then
      case when challenge.metric = 'workouts' then (
        select count(distinct coalesce(log.workout_session_id, log.session_id))::integer
        from public.client_workout_logs log
        where lower(log.client_email) = lower(mine.email)
          and log.completed_at >= challenge.accepted_at
          and log.completed_at < challenge.ends_at
      ) else (
        select count(*)::integer from public.client_gym_checkins checkin
        where checkin.client_email = lower(mine.email)
          and checkin.created_at >= challenge.accepted_at
          and checkin.created_at < challenge.ends_at
      ) end
    end,
    case when challenge.status = 'accepted' then
      case when challenge.metric = 'workouts' then (
        select count(distinct coalesce(log.workout_session_id, log.session_id))::integer
        from public.client_workout_logs log
        where lower(log.client_email) = lower(other_member.email)
          and log.completed_at >= challenge.accepted_at
          and log.completed_at < challenge.ends_at
      ) else (
        select count(*)::integer from public.client_gym_checkins checkin
        where checkin.client_email = lower(other_member.email)
          and checkin.created_at >= challenge.accepted_at
          and checkin.created_at < challenge.ends_at
      ) end
    end
  from community_private.client_community_challenges challenge
  join public.client_community_connections connection
    on connection.id = challenge.connection_id and connection.status = 'accepted'
  cross join actor
  join public.client_community_profiles peer on peer.user_id =
    case when challenge.initiator_id = actor.user_id then challenge.recipient_id
         else challenge.initiator_id end
  join auth.users mine on mine.id = actor.user_id
  join auth.users other_member on other_member.id = peer.user_id
  where actor.user_id is not null and not (select public.is_coach_admin())
    and actor.user_id in (challenge.initiator_id, challenge.recipient_id)
    and challenge.status in ('pending', 'accepted')
  order by challenge.created_at desc
  limit 50;
$$;

revoke all on function community_private.community_create_challenge(uuid, text, integer) from public, anon;
revoke all on function community_private.community_accept_challenge(uuid) from public, anon;
revoke all on function community_private.community_cancel_challenge(uuid) from public, anon;
revoke all on function community_private.community_challenge_summary() from public, anon;
grant execute on function community_private.community_create_challenge(uuid, text, integer) to authenticated;
grant execute on function community_private.community_accept_challenge(uuid) to authenticated;
grant execute on function community_private.community_cancel_challenge(uuid) to authenticated;
grant execute on function community_private.community_challenge_summary() to authenticated;

create function public.community_create_challenge(p_connection_id uuid, p_metric text, p_target_count integer)
returns uuid language sql security invoker set search_path = '' as $$
  select community_private.community_create_challenge(p_connection_id, p_metric, p_target_count);
$$;
create function public.community_accept_challenge(p_challenge_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select community_private.community_accept_challenge(p_challenge_id);
$$;
create function public.community_cancel_challenge(p_challenge_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select community_private.community_cancel_challenge(p_challenge_id);
$$;
create function public.community_challenge_summary()
returns table (
  id uuid, metric text, target_count integer, status text,
  peer_nickname text, peer_avatar_id text, incoming boolean,
  accepted_at timestamptz, ends_at timestamptz,
  my_count integer, peer_count integer
)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_challenge_summary();
$$;
revoke all on function public.community_create_challenge(uuid, text, integer) from public, anon;
revoke all on function public.community_accept_challenge(uuid) from public, anon;
revoke all on function public.community_cancel_challenge(uuid) from public, anon;
revoke all on function public.community_challenge_summary() from public, anon;
grant execute on function public.community_create_challenge(uuid, text, integer) to authenticated;
grant execute on function public.community_accept_challenge(uuid) to authenticated;
grant execute on function public.community_cancel_challenge(uuid) to authenticated;
grant execute on function public.community_challenge_summary() to authenticated;
