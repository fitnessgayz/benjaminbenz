-- Existing sharing choices were consent for accepted connections. A separate
-- default-off choice is required before showing them to all signed-in clients.
alter table public.client_community_preferences
  add column public_progress_opt_in boolean not null default false;

alter table public.client_community_profiles
  drop constraint client_community_profiles_avatar_id_check;
alter table public.client_community_profiles
  add constraint client_community_profiles_avatar_id_check
  check (avatar_id in ('strength','runner','cycling','boxing','yoga','swimming','martial','star',
    'lifting','walking','hiking','basketball','soccer','tennis','rowing','climbing'));

-- The implementation stays outside the exposed Data API schema. It returns
-- only a nickname, avatar, and the metrics this member explicitly selected.
-- Direct RLS access to profiles, invite codes, and workout records is unchanged.
create function community_private.community_public_progress()
returns table (
  nickname text,
  avatar_id text,
  xp integer,
  badge_ids text[],
  workout_count integer,
  gym_visit_count integer
)
language sql stable security definer set search_path = '' as $$
  select profile.display_name,
    profile.avatar_id,
    case when choice.xp_opt_in then achievement.xp end,
    case when choice.badges_opt_in then achievement.badge_ids end,
    case when choice.workout_count_opt_in then achievement.workout_count end,
    case when choice.gym_visits_opt_in then (
      select count(*)::integer
      from public.client_gym_checkins checkin
      where checkin.client_email = lower(member.email)
    ) end
  from public.client_community_profiles profile
  join public.client_community_preferences choice on choice.user_id = profile.user_id
  join auth.users member on member.id = profile.user_id
  left join public.client_community_achievements achievement
    on achievement.user_id = profile.user_id
  where (select auth.uid()) is not null
    and not (select public.is_coach_admin())
    and choice.public_progress_opt_in
    and (choice.gym_visits_opt_in or (
      achievement.user_id is not null
      and (choice.xp_opt_in or choice.badges_opt_in or choice.workout_count_opt_in)
    ))
  order by coalesce(achievement.updated_at, profile.created_at) desc, profile.user_id
  limit 100;
$$;

revoke all on function community_private.community_public_progress() from public, anon;
grant execute on function community_private.community_public_progress() to authenticated;

create function public.community_public_progress()
returns table (
  nickname text,
  avatar_id text,
  xp integer,
  badge_ids text[],
  workout_count integer,
  gym_visit_count integer
)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_public_progress();
$$;
revoke all on function public.community_public_progress() from public, anon;
grant execute on function public.community_public_progress() to authenticated;
