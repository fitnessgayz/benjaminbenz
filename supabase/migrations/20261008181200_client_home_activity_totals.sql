-- Return only the signed-in client's Home totals. Challenge assignments stay private.
create function community_private.client_home_activity_totals(p_local_day date)
returns table (challenge_streak integer, gym_visits integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  streak_day date := p_local_day;
  streak_count integer := 0;
  visit_count integer := 0;
begin
  if actor is null or (select public.is_coach_admin()) then
    raise exception 'Sign in as a client';
  end if;
  if p_local_day is null or p_local_day < current_date - 1 or p_local_day > current_date + 1 then
    raise exception 'Choose your current local day';
  end if;
  select lower(email) into actor_email from auth.users where id = actor;
  if actor_email is null then raise exception 'Account unavailable'; end if;

  select count(*)::integer into visit_count
  from public.client_gym_checkins checkin
  where lower(checkin.client_email) = actor_email and checkin.entry_date <= p_local_day;

  -- Today is still in progress; yesterday can anchor the streak.
  if not exists (
    select 1 from community_private.daily_challenge_assignments assignment
    join community_private.daily_challenge_catalog catalog on catalog.slug = assignment.challenge_slug
    where assignment.user_id = actor and assignment.challenge_date = streak_day
      and community_private.daily_challenge_completion(actor, streak_day,
        catalog.completion_kind, assignment.completed_at) is not null
  ) then streak_day := streak_day - 1; end if;

  loop
    exit when not exists (
      select 1 from community_private.daily_challenge_assignments assignment
      join community_private.daily_challenge_catalog catalog on catalog.slug = assignment.challenge_slug
      where assignment.user_id = actor and assignment.challenge_date = streak_day
        and community_private.daily_challenge_completion(actor, streak_day,
          catalog.completion_kind, assignment.completed_at) is not null
    );
    streak_count := streak_count + 1;
    streak_day := streak_day - 1;
  end loop;
  return query select streak_count, visit_count;
end;
$$;
revoke all on function community_private.client_home_activity_totals(date) from public, anon, authenticated;
grant execute on function community_private.client_home_activity_totals(date) to authenticated;

create function public.client_home_activity_totals(p_local_day date)
returns table (challenge_streak integer, gym_visits integer)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.client_home_activity_totals(p_local_day);
$$;
revoke all on function public.client_home_activity_totals(date) from public, anon;
grant execute on function public.client_home_activity_totals(date) to authenticated;
