-- The Wall is a projection of verified activity. Raw workout, check-in, and
-- challenge records remain private, and every event follows its owner's choice.
-- Earlier consent covered counts only; individual activity posts need a new opt-in.
alter table public.client_community_preferences
  add column wall_activity_opt_in boolean not null default false,
  add column weekly_challenge_opt_in boolean not null default false;

create table community_private.community_wall_props (
  event_id text not null check (char_length(event_id) between 1 and 140),
  sender_id uuid not null references public.client_community_profiles(user_id) on delete cascade,
  receiver_id uuid not null references public.client_community_profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, sender_id),
  check (sender_id <> receiver_id)
);
create index community_wall_props_receiver_idx
  on community_private.community_wall_props(receiver_id);
alter table community_private.community_wall_props enable row level security;
revoke all on community_private.community_wall_props from public, anon, authenticated;

create function community_private.community_wall_events()
returns table (
  event_id text, owner_id uuid, nickname text, avatar_id text,
  event_type text, headline text, occurred_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  with eligible as (
    select profile.user_id, profile.display_name, profile.avatar_id,
      lower(member.email) as email, pref.public_progress_opt_in,
      pref.workout_count_opt_in, pref.gym_visits_opt_in, pref.daily_challenge_opt_in,
      pref.wall_activity_opt_in, pref.weekly_challenge_opt_in
    from public.client_community_profiles profile
    join public.client_community_preferences pref on pref.user_id = profile.user_id
    join auth.users member on member.id = profile.user_id
    where (select auth.uid()) is not null and not (select public.is_coach_admin())
  ),
  gym_events as (
    select 'gym:' || eligible.user_id::text || ':' || checkin.entry_date::text,
      eligible.user_id, eligible.display_name, eligible.avatar_id,
      'gym_visit'::text, 'Checked in at the gym'::text, checkin.created_at
    from eligible
    join public.client_gym_checkins checkin on lower(checkin.client_email) = eligible.email
    where eligible.public_progress_opt_in and eligible.gym_visits_opt_in
      and eligible.wall_activity_opt_in
      and checkin.created_at >= now() - interval '90 days'
  ),
  workout_sessions as (
    select eligible.user_id, eligible.display_name, eligible.avatar_id,
      coalesce(log.workout_session_id, log.session_id, log.id) as session_key,
      max(log.completed_at) as finished_at
    from eligible
    join public.client_workout_logs log on lower(log.client_email) = eligible.email
    where eligible.public_progress_opt_in and eligible.workout_count_opt_in
      and eligible.wall_activity_opt_in
      and log.completed_at >= now() - interval '90 days'
    group by eligible.user_id, eligible.display_name, eligible.avatar_id,
      coalesce(log.workout_session_id, log.session_id, log.id)
  ),
  workout_events as (
    select 'workout:' || session.user_id::text || ':' || session.session_key::text,
      session.user_id, session.display_name, session.avatar_id,
      'workout'::text, 'Completed a workout'::text, session.finished_at
    from workout_sessions session
  ),
  daily_events as (
    select 'daily:' || eligible.user_id::text || ':' || assignment.challenge_date::text,
      eligible.user_id, eligible.display_name, eligible.avatar_id,
      'daily_challenge'::text, 'Completed today’s challenge: ' || catalog.title,
      community_private.daily_challenge_completion(
        eligible.user_id, assignment.challenge_date, catalog.completion_kind, assignment.completed_at)
    from eligible
    join community_private.daily_challenge_assignments assignment
      on assignment.user_id = eligible.user_id
    join community_private.daily_challenge_catalog catalog on catalog.slug = assignment.challenge_slug
    where eligible.daily_challenge_opt_in
      and assignment.challenge_date >= current_date - 90
      and community_private.daily_challenge_completion(
        eligible.user_id, assignment.challenge_date, catalog.completion_kind, assignment.completed_at) is not null
  ),
  weekly_progress as (
    select challenge.id, eligible.user_id, eligible.display_name, eligible.avatar_id,
      case challenge.metric
        when 'workouts' then (
          select sessions.finished_at from (
            select max(log.completed_at) as finished_at
            from public.client_workout_logs log
            where lower(log.client_email) = eligible.email
              and log.completed_at >= challenge.accepted_at
              and log.completed_at < challenge.ends_at
            group by coalesce(log.workout_session_id, log.session_id, log.id)
          ) sessions order by sessions.finished_at
          offset challenge.target_count - 1 limit 1
        )
        when 'gym_visits' then (
          select checkin.created_at from public.client_gym_checkins checkin
          where lower(checkin.client_email) = eligible.email
            and checkin.created_at >= challenge.accepted_at
            and checkin.created_at < challenge.ends_at
          order by checkin.created_at
          offset challenge.target_count - 1 limit 1
        )
      end as reached_at
    from community_private.client_community_challenges challenge
    join eligible on eligible.user_id in (challenge.initiator_id, challenge.recipient_id)
    where challenge.status = 'accepted' and eligible.weekly_challenge_opt_in
      and challenge.accepted_at >= now() - interval '90 days'
  ),
  weekly_events as (
    select 'weekly:' || progress.id::text || ':' || progress.user_id::text,
      progress.user_id, progress.display_name, progress.avatar_id,
      'weekly_challenge'::text, 'Completed a weekly challenge'::text, progress.reached_at
    from weekly_progress progress where progress.reached_at is not null
  )
  select * from gym_events
  union all select * from workout_events
  union all select * from daily_events
  union all select * from weekly_events;
$$;
revoke all on function community_private.community_wall_events() from public, anon;
grant execute on function community_private.community_wall_events() to authenticated;

create function community_private.community_wall_feed()
returns table (
  event_id text, nickname text, avatar_id text, event_type text,
  headline text, occurred_at timestamptz, props_count integer,
  gave_props boolean, can_give_props boolean, is_own boolean
)
language sql stable security definer set search_path = '' as $$
  select event.event_id, event.nickname, event.avatar_id, event.event_type,
    event.headline, event.occurred_at,
    (select count(*)::integer from community_private.community_wall_props props
      where props.event_id = event.event_id),
    exists (select 1 from community_private.community_wall_props props
      where props.event_id = event.event_id and props.sender_id = (select auth.uid())),
    event.owner_id <> (select auth.uid()) and exists (
      select 1 from public.client_community_profiles viewer
      where viewer.user_id = (select auth.uid())),
    event.owner_id = (select auth.uid())
  from community_private.community_wall_events() event
  order by event.occurred_at desc, event.event_id
  limit 100;
$$;
revoke all on function community_private.community_wall_feed() from public, anon;
grant execute on function community_private.community_wall_feed() to authenticated;

create function community_private.community_give_wall_props(p_event_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); receiver uuid; inserted_event text;
begin
  if actor is null or p_event_id is null or (select public.is_coach_admin())
    or not exists (select 1 from public.client_community_profiles where user_id = actor) then
    return false;
  end if;
  select event.owner_id into receiver from community_private.community_wall_events() event
    where event.event_id = p_event_id;
  if receiver is null or receiver = actor then return false; end if;
  insert into community_private.community_wall_props(event_id, sender_id, receiver_id)
    values (p_event_id, actor, receiver)
    on conflict (event_id, sender_id) do nothing
    returning event_id into inserted_event;
  return inserted_event is not null;
end;
$$;
revoke all on function community_private.community_give_wall_props(text) from public, anon;
grant execute on function community_private.community_give_wall_props(text) to authenticated;

create function public.community_wall_feed()
returns table (
  event_id text, nickname text, avatar_id text, event_type text,
  headline text, occurred_at timestamptz, props_count integer,
  gave_props boolean, can_give_props boolean, is_own boolean
)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_wall_feed();
$$;
revoke all on function public.community_wall_feed() from public, anon;
grant execute on function public.community_wall_feed() to authenticated;

create function public.community_give_wall_props(p_event_id text)
returns boolean language sql security invoker set search_path = '' as $$
  select community_private.community_give_wall_props(p_event_id);
$$;
revoke all on function public.community_give_wall_props(text) from public, anon;
grant execute on function public.community_give_wall_props(text) to authenticated;
