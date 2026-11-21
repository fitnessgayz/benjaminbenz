-- Leaderboard sharing is independent of Wall and public progress settings.
-- Absence of an opt-out means a Community profile participates by default.
-- Keep the opt-out if a member leaves Community and later joins again.
create table community_private.community_weekly_leaderboard_opt_outs (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table community_private.community_weekly_leaderboard_opt_outs enable row level security;
revoke all on community_private.community_weekly_leaderboard_opt_outs from public, anon, authenticated;

-- These normalizers mirror the client achievement engines for saved log values.
create function community_private.achievement_search_key(value text)
returns text
language sql immutable strict set search_path = '' as $$
  select btrim(regexp_replace(lower(regexp_replace(normalize(value, NFD),
    U&'[\0300-\036F]', '', 'g')), '[[:space:]]+', ' ', 'g'));
$$;

create function community_private.achievement_activity_label(value text)
returns text
language sql immutable strict set search_path = '' as $$
  select btrim(regexp_replace(regexp_replace(value, '[''’]', '', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;

revoke all on function community_private.achievement_search_key(text) from public, anon, authenticated;
revoke all on function community_private.achievement_activity_label(text) from public, anon, authenticated;

-- Shared classification keeps public summaries aligned with achievement metrics.
create function community_private.achievement_activity_flags(exercise_key text, code text, title_key text, has_duration boolean)
returns table (is_mobility boolean, is_yoga boolean, is_cardio boolean, is_legacy_recovery boolean)
language plpgsql immutable set search_path = '' as $$
declare
  mobility_pattern constant text := '^(?:(?:upper body|lower body|full body|gentle|daily|morning|evening) )?(?:mobility|stretching|flexibility|mobility and flexibility|stretching and mobility)(?: session| workout| routine)?$|^(upper body|lower body|full body) recovery$';
  yoga_pattern constant text := '^(?:(?:morning|evening|gentle|power|restorative|yin|hatha|vinyasa|ashtanga|hot) )?yoga(?: flow| session| class| practice| workout)?$|^(?:vinyasa|hatha|yin yoga)(?: flow| session| class| practice)?$';
  cardio_names constant text[] := array['cardio', 'walk', 'walking', 'brisk walk', 'run', 'running', 'jog', 'jogging',
    'bike', 'biking', 'cycling', 'stationary bike', 'indoor cycling', 'elliptical', 'stair climber', 'stairclimber',
    'rowing', 'rowing machine', 'swim', 'swimming', 'treadmill', 'jump rope'];
  mobility_names constant text[] := array['cat cow', 'side lying open book', 'open book', 'shoulder circles',
    'supine ankle circles', 'ankle circles', 'hip circles', 'worlds greatest stretch', '90 90 hip switches'];
  yoga_names constant text[] := array['downward dog', 'downward facing dog', 'upward dog', 'upward facing dog',
    'childs pose', 'child pose', 'warrior pose', 'warrior 1', 'warrior 2', 'warrior i', 'warrior ii', 'tree pose', 'pigeon pose',
    'cobra pose', 'triangle pose', 'mountain pose', 'corpse pose', 'sun salutation', 'sun salutations',
    'savasana', 'balasana', 'adho mukha svanasana'];
  activity_name text := community_private.achievement_activity_label(exercise_key);
  activity_code text := community_private.achievement_activity_label(code);
begin
  return query
  with title_flags as (
    select coalesce(bool_or(label ~ mobility_pattern), false) as is_mobility,
      coalesce(bool_or(label ~ yoga_pattern), false) as is_yoga,
      coalesce(bool_or(label = any(cardio_names)), false) as is_cardio,
      coalesce(bool_or(label = 'mobility' or label ~ yoga_pattern), false) as is_legacy_recovery
    from unnest(string_to_array(title_key, '·')) as part(value)
    cross join lateral (values (community_private.achievement_activity_label(part.value))) as labels(label)
  ),
  flags as (
    select activity_code in ('mobility', 'stretch', 'stretching', 'flexibility', 'recovery')
        or activity_name = any(mobility_names)
        or activity_name ~ mobility_pattern
        or activity_name ~ '(^| )(stretch|stretching|mobility|flexibility|foam roll|foam rolling)$'
        or title.is_mobility as mobility,
      activity_code = 'yoga' or activity_name = any(yoga_names)
        or activity_name ~ yoga_pattern or title.is_yoga as yoga,
      code = 'cardio' or (has_duration and (activity_name = any(cardio_names) or title.is_cardio)) as cardio_candidate,
      activity_code in ('mobility', 'stretch', 'stretching', 'flexibility', 'yoga')
        or title.is_legacy_recovery as legacy_recovery
    from title_flags title
  )
  select flags.mobility, flags.yoga,
    flags.cardio_candidate and not flags.mobility and not flags.yoga, flags.legacy_recovery
  from flags;
end;
$$;

revoke all on function community_private.achievement_activity_flags(text, text, text, boolean) from public, anon, authenticated;

create function community_private.community_weekly_leaderboard()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  clock_time timestamptz := now();
  week_start_local timestamp := date_trunc('week', clock_time at time zone 'America/Los_Angeles');
  week_start_at timestamptz := week_start_local at time zone 'America/Los_Angeles';
  today_local date := (clock_time at time zone 'America/Los_Angeles')::date;
  can_participate boolean;
  sharing_enabled boolean;
  entries jsonb;
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception using errcode = '42501', message = 'Sign in to see the leaderboard.';
  end if;

  select exists (
    select 1 from public.client_community_profiles profile where profile.user_id = actor
  ) into can_participate;

  sharing_enabled := can_participate and not exists (
    select 1 from community_private.community_weekly_leaderboard_opt_outs opt_out where opt_out.user_id = actor
  );

  with participants as materialized (
    select profile.user_id, profile.display_name, profile.avatar_id, lower(member.email) as email
    from public.client_community_profiles profile
    join auth.users member on member.id = profile.user_id
    where not exists (
      select 1 from community_private.community_weekly_leaderboard_opt_outs opt_out
      where opt_out.user_id = profile.user_id
    )
  ),
  completed_sessions as (
    select profile.user_id, coalesce(log.workout_session_id, log.session_id, log.id) as session_key
    from participants profile
    join public.client_workout_logs log on lower(log.client_email) = profile.email
    where log.completed_at >= week_start_at
    group by profile.user_id, coalesce(log.workout_session_id, log.session_id, log.id)
    having max(log.completed_at) <= clock_time
  ),
  workout_totals as (
    select session.user_id, count(*)::integer as workout_count
    from completed_sessions session
    group by session.user_id
  ),
  check_in_totals as (
    select profile.user_id, count(distinct check_in.entry_date)::integer as check_in_count
    from participants profile
    join public.client_gym_checkins check_in on check_in.client_email = profile.email
    where check_in.created_at between week_start_at and clock_time
    group by profile.user_id
  ),
  -- PR baselines and original badge dates require earlier sessions. Read full
  -- histories only for participants with workout activity dated this week.
  achievement_candidates as (
    select profile.user_id, profile.email from participants profile
    where exists (
      select 1 from public.client_workout_logs recent
      where lower(recent.client_email) = profile.email
        and recent.entry_date between week_start_local::date and today_local
    )
  ),
  latest_sets as (
    select distinct on (profile.user_id, coalesce('set:' || log.set_id, 'row:' || log.id))
      profile.user_id, log.entry_date, log.completed_at,
      coalesce('session:' || coalesce(log.session_id, log.workout_session_id), '') as stable_session_key,
      community_private.achievement_search_key(coalesce(nullif(log.workout_title, ''), 'Workout')) as title_key,
      community_private.achievement_search_key(coalesce(log.exercise_name, '')) as exercise_key,
      community_private.achievement_search_key(coalesce(log.exercise_code, '')) as code,
      coalesce(log.set_type, 'working') as set_type, coalesce(log.set_number, 0) as set_number,
      coalesce(log.weight_used, 0) as weight, log.reps,
      coalesce(log.duration_seconds > 0 and log.duration_seconds < 'Infinity'::numeric, false) as has_duration
    from achievement_candidates profile
    join public.client_workout_logs log on lower(log.client_email) = profile.email
    order by profile.user_id, coalesce('set:' || log.set_id, 'row:' || log.id),
      greatest(log.client_updated_at, log.updated_at, log.created_at) desc nulls last,
      log.id desc
  ),
  -- An older set without a session ID can join a single unambiguous match.
  valid_sets as materialized (
    select log.*,
      min(nullif(log.stable_session_key, '')) over same_title as first_session_key,
      max(nullif(log.stable_session_key, '')) over same_title as last_session_key
    from latest_sets log
    where log.entry_date between date '0001-01-01' and today_local
    window same_title as (partition by log.user_id, log.entry_date, log.title_key)
  ),
  typed_sets as (
    select log.*,
      coalesce(nullif(log.stable_session_key, ''),
        case when log.first_session_key = log.last_session_key then log.first_session_key end,
        'legacy:' || to_char(log.entry_date, 'YYYY-MM-DD') || '::' || log.title_key) as session_key,
      log.set_type = 'warm_up' or log.set_number >= 1000 or log.code = 'warmup' as is_warmup,
      coalesce(log.reps > 0 and log.reps < 'Infinity'::numeric, false) as has_reps
    from valid_sets log
  ),
  classified_sets as materialized (
    select log.user_id, log.session_key, log.entry_date, log.completed_at, log.exercise_key, log.weight, log.reps,
      flags.is_mobility, flags.is_yoga, flags.is_cardio,
      log.set_type = 'timed' or log.has_duration as is_timed,
      case
        when log.is_warmup then false
        when log.code = 'cardio' or flags.is_legacy_recovery then
          log.has_duration or (log.weight > 0 and log.weight < 'Infinity'::numeric) or (log.code <> 'cardio' and log.has_reps)
        when log.set_type = 'timed' or log.has_duration then log.has_duration
        else log.weight >= 0 and log.weight < 'Infinity'::numeric and log.has_reps
      end as is_meaningful
    from typed_sets log
    cross join lateral community_private.achievement_activity_flags(
      log.exercise_key, log.code, log.title_key, log.has_duration
    ) flags
  ),
  achievement_sessions as (
    select log.user_id, log.session_key, min(log.entry_date) as trained_on,
      date_trunc('week', min(log.entry_date)::timestamp)::date as training_week,
      min(log.completed_at) as completed_at,
      bool_or(log.is_cardio and log.is_meaningful) as has_cardio,
      bool_or(log.is_mobility and log.is_meaningful) as has_mobility,
      bool_or(log.is_yoga and log.is_meaningful) as has_yoga
    from classified_sets log
    group by log.user_id, log.session_key
    having min(log.completed_at) <= clock_time and bool_or(log.is_meaningful)
  ),
  session_exercise_bests as (
    select session.user_id, session.session_key, session.trained_on, session.completed_at, log.exercise_key,
      max(log.weight) as top_weight, max(log.reps) filter (where log.weight = 0) as bodyweight_reps
    from achievement_sessions session
    join classified_sets log using (user_id, session_key)
    where log.is_meaningful and log.exercise_key <> ''
      and not (log.is_cardio or log.is_timed or log.is_mobility or log.is_yoga)
    group by session.user_id, session.session_key, session.trained_on, session.completed_at, log.exercise_key
  ),
  prior_bests as (
    select current_best.*, max(top_weight) over prior as prior_weight,
      max(bodyweight_reps) over prior as prior_reps
    from session_exercise_bests current_best
    window prior as (partition by user_id, exercise_key order by trained_on, completed_at, session_key collate "C"
      rows between unbounded preceding and 1 preceding)
  ),
  session_prs as (
    select user_id, session_key, count(*)::integer as pr_count
    from prior_bests
    where (prior_weight > 0 and top_weight > prior_weight)
      or (prior_reps > 0 and bodyweight_reps > prior_reps)
    group by user_id, session_key
  ),
  consecutive_training_weeks as (
    select week.*, week.training_week - 7 * (row_number() over (partition by user_id order by training_week))::integer as streak_group
    from (select distinct user_id, training_week from achievement_sessions) week
  ),
  streaks as (
    select week.*, row_number() over (partition by user_id, streak_group order by training_week) as streak
    from consecutive_training_weeks week
  ),
  session_history as (
    select session.*, streak.streak, coalesce(pr.pr_count, 0) as prs,
      lag(session.trained_on) over chronological as previous_training_day
    from achievement_sessions session
    join streaks streak using (user_id, training_week)
    left join session_prs pr using (user_id, session_key)
    window chronological as (partition by session.user_id order by session.trained_on, session.completed_at, session.session_key collate "C")
  ),
  running_progress as (
    select history.user_id, history.trained_on, history.streak,
      count(*) over chronological as workouts,
      sum(history.prs) over chronological as prs,
      count(*) filter (where history.trained_on - history.previous_training_day >= 14) over chronological as comebacks,
      count(*) filter (where history.has_cardio) over chronological as cardio,
      count(*) filter (where history.has_mobility) over chronological as mobility,
      count(*) filter (where history.has_yoga) over chronological as yoga
    from session_history history
    window chronological as (partition by history.user_id order by history.trained_on, history.completed_at,
      history.session_key collate "C" rows unbounded preceding)
  ),
  -- Same 24 badge thresholds as ClientAchievements.swift and client-achievements.js.
  -- A badge is earned this week only if the full history first crosses its target now.
  badge_progress as (
    select user_id, metric.targets, max(metric.value) as current_value,
      coalesce(max(metric.value) filter (where history.trained_on < week_start_local::date), 0) as previous_value
    from running_progress history
    cross join lateral (values
      ('workouts', array[1, 5, 10, 25, 50, 100, 250], history.workouts), ('prs', array[1, 5, 10, 25], history.prs),
      ('weeks', array[3, 8, 12], history.streak), ('comebacks', array[1], history.comebacks),
      ('cardio', array[1, 10, 50], history.cardio), ('mobility', array[1, 10, 25], history.mobility),
      ('yoga', array[1, 10, 25], history.yoga)
    ) metric(name, targets, value)
    group by user_id, metric.name, metric.targets
  ),
  achievement_totals as (
    select user_id, count(*)::integer as badge_count
    from badge_progress badge
    cross join lateral unnest(badge.targets) as threshold(value)
    where badge.previous_value < threshold.value and badge.current_value >= threshold.value
    group by user_id
  ),
  weekly_pr_totals as (
    select user_id, sum(prs)::integer as pr_count
    from session_history
    where trained_on >= week_start_local::date
    group by user_id
  ),
  totals as (
    select profile.user_id, profile.display_name, profile.avatar_id,
      coalesce(workout.workout_count, 0) as workout_count,
      coalesce(check_in.check_in_count, 0) as check_in_count,
      coalesce(pr.pr_count, 0) as pr_count, coalesce(badge.badge_count, 0) as badge_count
    from participants profile
    left join workout_totals workout using (user_id)
    left join check_in_totals check_in using (user_id)
    left join weekly_pr_totals pr using (user_id)
    left join achievement_totals badge using (user_id)
    where workout.workout_count > 0 or check_in.check_in_count > 0 or pr.pr_count > 0 or badge.badge_count > 0
  ),
  ranked as (
    select total.*, rank() over (order by total.workout_count desc)::integer as position
    from totals total
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rank', ranked.position,
        'nickname', ranked.display_name,
        'avatar_id', ranked.avatar_id,
        'workout_count', ranked.workout_count,
        'check_in_count', ranked.check_in_count,
        'pr_count', ranked.pr_count,
        'badge_count', ranked.badge_count,
        'is_own', ranked.user_id = actor
      )
      order by ranked.position, lower(ranked.display_name), ranked.display_name, ranked.user_id
    ),
    '[]'::jsonb
  ) into entries
  from ranked;

  return jsonb_build_object(
    'week_start', to_char(week_start_local, 'YYYY-MM-DD'),
    'can_participate', can_participate,
    'sharing_enabled', sharing_enabled,
    'entries', entries
  );
end;
$$;

create function community_private.community_set_leaderboard_sharing(p_enabled boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true'
    or not exists (
      select 1 from public.client_community_profiles profile where profile.user_id = actor
    ) then
    raise exception using errcode = '42501', message = 'Set up your Community profile to join the leaderboard.';
  end if;
  if p_enabled is null then
    raise exception using errcode = '22023', message = 'Choose whether to appear on the leaderboard.';
  end if;

  if p_enabled then
    delete from community_private.community_weekly_leaderboard_opt_outs where user_id = actor;
  else
    insert into community_private.community_weekly_leaderboard_opt_outs(user_id) values (actor)
      on conflict (user_id) do nothing;
  end if;
  return p_enabled;
end;
$$;

revoke all on function community_private.community_weekly_leaderboard() from public, anon, authenticated;
revoke all on function community_private.community_set_leaderboard_sharing(boolean) from public, anon, authenticated;
grant execute on function community_private.community_weekly_leaderboard() to authenticated;
grant execute on function community_private.community_set_leaderboard_sharing(boolean) to authenticated;

create function public.community_weekly_leaderboard()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select community_private.community_weekly_leaderboard();
$$;

create function public.community_set_leaderboard_sharing(p_enabled boolean)
returns boolean
language sql security invoker set search_path = '' as $$
  select community_private.community_set_leaderboard_sharing(p_enabled);
$$;

revoke all on function public.community_weekly_leaderboard() from public, anon, authenticated;
revoke all on function public.community_set_leaderboard_sharing(boolean) from public, anon, authenticated;
grant execute on function public.community_weekly_leaderboard() to authenticated;
grant execute on function public.community_set_leaderboard_sharing(boolean) to authenticated;
