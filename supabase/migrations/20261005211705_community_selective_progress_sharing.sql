-- Community members choose each visible milestone independently. Existing
-- badge consent also covered XP, so preserve that choice when splitting it.
alter table public.client_community_preferences
  add column xp_opt_in boolean not null default false,
  add column workout_count_opt_in boolean not null default false,
  add column gym_visits_opt_in boolean not null default false;

update public.client_community_preferences
  set xp_opt_in = true
  where badges_opt_in = true;

alter table public.client_community_achievements
  add column workout_count integer check (workout_count between 0 and 100000000);
grant insert (workout_count), update (workout_count)
  on public.client_community_achievements to authenticated;

-- Row policies cannot conceal one column while exposing another. Owners keep
-- direct access; friends receive only selected fields through the narrow RPC.
drop policy if exists "Achievement owner or permitted connection can read"
  on public.client_community_achievements;
create policy "Achievement owner can read"
  on public.client_community_achievements for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Accepted connections read sharing choices"
  on public.client_community_preferences;

create function community_private.community_shared_progress()
returns table (
  user_id uuid,
  xp integer,
  badge_ids text[],
  workout_count integer,
  gym_visit_count integer
)
language sql stable security definer set search_path = '' as $$
  select p.user_id,
    case when p.xp_opt_in then a.xp end,
    case when p.badges_opt_in then a.badge_ids end,
    case when p.workout_count_opt_in then a.workout_count end,
    case when p.gym_visits_opt_in then (
      select count(*)::integer
      from public.client_gym_checkins g
      join auth.users u on u.id = p.user_id
      where g.client_email = lower(u.email)
    ) end
  from public.client_community_preferences p
  join public.client_community_connections c
    on c.status = 'accepted'
   and ((c.user_a = (select auth.uid()) and c.user_b = p.user_id)
     or (c.user_b = (select auth.uid()) and c.user_a = p.user_id))
  left join public.client_community_achievements a on a.user_id = p.user_id
  where (select auth.uid()) is not null;
$$;
revoke all on function community_private.community_shared_progress() from public, anon;
grant execute on function community_private.community_shared_progress() to authenticated;

create function public.community_shared_progress()
returns table (
  user_id uuid,
  xp integer,
  badge_ids text[],
  workout_count integer,
  gym_visit_count integer
)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_shared_progress();
$$;
revoke all on function public.community_shared_progress() from public, anon;
grant execute on function public.community_shared_progress() to authenticated;
