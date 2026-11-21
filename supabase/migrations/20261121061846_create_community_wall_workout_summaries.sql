-- Add a narrow summary projection for workouts already shared to the Wall.
-- The original feed and private log policies keep their existing contracts.
create function community_private.community_wall_workout_summaries(p_event_ids text[])
returns table (event_id text, title text, minutes integer, sets integer, volume_lb numeric, exercises jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or (auth.jwt() ->> 'is_anonymous') = 'true'
    or p_event_ids is null or cardinality(p_event_ids) not between 1 and 100 then
    return;
  end if;

  return query
  with shared_workouts as materialized (
    select event.event_id,
      split_part(event.event_id, ':', 2)::uuid as owner_id,
      split_part(event.event_id, ':', 3)::uuid as session_key
    from community_private.community_wall_feed() event
    where event.event_type = 'workout'
      and event.event_id = any(p_event_ids)
      and event.occurred_at between now() - interval '72 hours' and now()
      and event.event_id ~ '^workout:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  ),
  shared_log_rows as (
    select distinct on (workout.event_id, coalesce('set:' || log.set_id, 'row:' || log.id))
      workout.event_id, log.id, log.completed_at, log.workout_duration_seconds,
      community_private.achievement_search_key(coalesce(log.exercise_code, '')) as exercise_code,
      community_private.achievement_search_key(coalesce(label.exercise_name, '')) as exercise_key,
      label.exercise_name,
      log.exercise_order, log.set_type, log.set_number, log.weight_used, log.reps,
      coalesce(log.duration_seconds > 0 and log.duration_seconds < 'Infinity'::numeric, false) as has_duration,
      btrim(regexp_replace(log.workout_title, '[[:space:][:cntrl:]]+', ' ', 'g')) as stored_title,
      nullif(btrim(regexp_replace(log.gym_name, '[[:space:][:cntrl:]]+', ' ', 'g')), '') as gym_name
    from shared_workouts workout
    join auth.users member on member.id = workout.owner_id
    join public.client_workout_logs log on lower(log.client_email) = lower(member.email)
      and coalesce(log.workout_session_id, log.session_id, log.id) = workout.session_key
    cross join lateral (
      values (nullif(btrim(regexp_replace(log.exercise_name, '[[:space:][:cntrl:]]+', ' ', 'g')), ''))
    ) label(exercise_name)
    order by workout.event_id, coalesce('set:' || log.set_id, 'row:' || log.id),
      greatest(log.client_updated_at, log.updated_at, log.created_at) desc nulls last, log.id desc
  ),
  display_rows as (
    select log.*,
      case
        when log.stored_title ~* '^copy of ' then
          regexp_replace(log.stored_title, ' · [0-9a-f]{8}$', '', 'i')
        when log.stored_title ~* '^custom workout · new( · [0-9:.]+)?$' then 'Custom Workout'
        else regexp_replace(
          log.stored_title, ' · [0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$', '', 'i'
        )
      end as display_title
    from shared_log_rows log
    where log.completed_at between now() - interval '90 days' and now()
  ),
  title_rows as (
    select log.*,
      case
        when lower(log.display_title) = lower(log.gym_name) then null
        when lower(right(log.display_title, char_length(' · ' || log.gym_name))) = lower(' · ' || log.gym_name)
          then left(log.display_title, -char_length(' · ' || log.gym_name))
        else log.display_title
      end as title_without_gym
    from display_rows log
  ),
  summary_rows as (
    select log.event_id, log.id, log.completed_at, log.workout_duration_seconds, log.title_without_gym,
      log.exercise_name, log.exercise_key, log.exercise_code, log.exercise_order, log.weight_used, log.reps,
      log.exercise_code not in ('warmup', 'cardio') and log.exercise_key <> ''
        and coalesce(log.set_number < 1000, true)
        and coalesce(log.set_type, 'working') in ('working', 'drop', 'failure')
        and not (log.has_duration or flags.is_mobility or flags.is_yoga or flags.is_cardio or flags.is_legacy_recovery)
        and coalesce(log.weight_used, 0) >= 0 and coalesce(log.weight_used, 0) < 'Infinity'::numeric
        and coalesce(log.reps > 0 and log.reps < 'Infinity'::numeric, false) as counts_as_set
    from title_rows log
    cross join lateral community_private.achievement_activity_flags(log.exercise_key, log.exercise_code,
      community_private.achievement_search_key(regexp_replace(coalesce(log.title_without_gym, ''), '^copy of ', '', 'i')),
      log.has_duration) flags
  ),
  session_totals as (
    select summary.event_id,
      left((array_agg(nullif(btrim(summary.title_without_gym), '')
        order by summary.completed_at desc, summary.id)
        filter (where nullif(btrim(summary.title_without_gym), '') is not null))[1], 120) as title,
      case when max(summary.workout_duration_seconds) > 0
        then greatest(1, round(max(summary.workout_duration_seconds) / 60.0)::integer)
      end as minutes,
      nullif(count(*) filter (where summary.counts_as_set), 0)::integer as sets,
      sum(summary.weight_used * summary.reps) filter (where summary.counts_as_set and summary.weight_used > 0) as volume_lb
    from summary_rows summary
    group by summary.event_id
  ),
  exercise_counts as (
    select summary.event_id, summary.exercise_key, min(summary.exercise_order) as exercise_order,
      min(nullif(summary.exercise_code, '')) as exercise_code,
      left(min(summary.exercise_name), 120) as exercise_name, count(*)::integer as set_count
    from summary_rows summary
    where summary.counts_as_set
    group by summary.event_id, summary.exercise_key
  ),
  exercise_ranked as (
    select exercise.*,
      row_number() over (partition by exercise.event_id order by exercise.exercise_order nulls last,
        exercise.exercise_code nulls last, exercise.exercise_key) as position
    from exercise_counts exercise
  ),
  exercise_previews as (
    select exercise.event_id,
      jsonb_agg(jsonb_build_object('name', exercise.exercise_name, 'sets', exercise.set_count)
        order by exercise.position) as previews
    from exercise_ranked exercise
    where exercise.position <= 3
    group by exercise.event_id
  )
  select summary.event_id, summary.title, summary.minutes, summary.sets, summary.volume_lb,
    coalesce(preview.previews, '[]'::jsonb)
  from session_totals summary
  left join exercise_previews preview on preview.event_id = summary.event_id;
end;
$$;

revoke all on function community_private.community_wall_workout_summaries(text[])
  from public, anon, authenticated;
grant execute on function community_private.community_wall_workout_summaries(text[])
  to authenticated;

create function public.community_wall_workout_summaries(p_event_ids text[])
returns table (event_id text, title text, minutes integer, sets integer, volume_lb numeric, exercises jsonb)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_wall_workout_summaries(p_event_ids);
$$;

revoke all on function public.community_wall_workout_summaries(text[]) from public, anon, authenticated;
grant execute on function public.community_wall_workout_summaries(text[]) to authenticated;
