alter table public.client_community_profiles
  add column avatar_id text not null default 'strength'
  check (avatar_id in ('strength','runner','cycling','boxing','yoga','swimming','martial','star'));
grant insert (avatar_id), update (avatar_id)
  on public.client_community_profiles to authenticated;

create table community_private.client_community_props (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.client_community_connections(id) on delete cascade,
  sender_id uuid not null references public.client_community_profiles(user_id) on delete cascade,
  receiver_id uuid not null references public.client_community_profiles(user_id) on delete cascade,
  props_date date not null default (timezone('utc', now())::date),
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id),
  unique (connection_id, sender_id, props_date)
);
create index client_community_props_receiver_idx
  on community_private.client_community_props(receiver_id);
alter table community_private.client_community_props enable row level security;
revoke all on community_private.client_community_props from public, anon, authenticated;

create function community_private.community_give_props(p_receiver_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  matched_connection uuid;
  inserted_id uuid;
begin
  if actor is null or p_receiver_id is null or actor = p_receiver_id then
    return false;
  end if;
  select c.id into matched_connection
    from public.client_community_connections c
    where c.status = 'accepted'
      and ((c.user_a = actor and c.user_b = p_receiver_id)
        or (c.user_b = actor and c.user_a = p_receiver_id));
  if matched_connection is null then
    raise exception 'Connect before giving props';
  end if;
  insert into community_private.client_community_props
    (connection_id, sender_id, receiver_id)
    values (matched_connection, actor, p_receiver_id)
    on conflict (connection_id, sender_id, props_date) do nothing
    returning id into inserted_id;
  return inserted_id is not null;
end;
$$;

create function community_private.community_props_summary()
returns table (user_id uuid, received_count integer, sent_today boolean)
language sql stable security definer set search_path = '' as $$
  with visible as (
    select p.user_id from public.client_community_profiles p
      where p.user_id = (select auth.uid())
    union
    select case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
      from public.client_community_connections c
      where c.status = 'accepted'
        and (select auth.uid()) in (c.user_a, c.user_b)
  )
  select v.user_id,
    (select count(*)::integer from community_private.client_community_props p
       where p.receiver_id = v.user_id),
    exists(select 1 from community_private.client_community_props p
       where p.sender_id = (select auth.uid()) and p.receiver_id = v.user_id
         and p.props_date = timezone('utc', now())::date)
  from visible v;
$$;
revoke all on function community_private.community_give_props(uuid) from public, anon;
revoke all on function community_private.community_props_summary() from public, anon;
grant execute on function community_private.community_give_props(uuid) to authenticated;
grant execute on function community_private.community_props_summary() to authenticated;

create function public.community_give_props(p_receiver_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select community_private.community_give_props(p_receiver_id);
$$;
create function public.community_props_summary()
returns table (user_id uuid, received_count integer, sent_today boolean)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_props_summary();
$$;
revoke all on function public.community_give_props(uuid) from public, anon;
revoke all on function public.community_props_summary() from public, anon;
grant execute on function public.community_give_props(uuid) to authenticated;
grant execute on function public.community_props_summary() to authenticated;
