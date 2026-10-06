-- A private, server-assigned daily challenge. Activity data never enters the public feed.
alter table public.client_community_preferences
  add column daily_challenge_opt_in boolean not null default false;

create table community_private.daily_challenge_catalog (
  slug text primary key,
  title text not null,
  instruction text not null,
  category text not null,
  effort text not null check (effort in ('easy', 'training')),
  completion_kind text not null default 'self_report'
    check (completion_kind in ('self_report', 'workout', 'gym_visit'))
);
alter table community_private.daily_challenge_catalog enable row level security;
revoke all on community_private.daily_challenge_catalog from public, anon, authenticated;

insert into community_private.daily_challenge_catalog
  (slug, title, instruction, category, effort, completion_kind) values
  ('walk-five', 'Five-minute walk', 'Take a comfortable five-minute walk, indoors or outside.', 'movement', 'easy', 'self_report'),
  ('walk-ten', 'Ten-minute walk', 'Walk at an easy pace for ten minutes.', 'movement', 'easy', 'self_report'),
  ('walk-new-route', 'Change your route', 'Take a short walk along a route you do not usually use.', 'movement', 'easy', 'self_report'),
  ('walk-after-meal', 'After-meal walk', 'Take a comfortable short walk after a meal.', 'movement', 'easy', 'self_report'),
  ('march-in-place', 'March in place', 'March in place gently for two minutes.', 'movement', 'easy', 'self_report'),
  ('move-between-tasks', 'Movement break', 'Take a two-minute movement break between tasks.', 'movement', 'easy', 'self_report'),
  ('stairs-or-flat', 'Take the long way', 'Move for three extra minutes; stairs are optional.', 'movement', 'easy', 'self_report'),
  ('dance-one-song', 'Move to a song', 'Move however you like for one song.', 'movement', 'easy', 'self_report'),
  ('stand-and-stretch', 'Stand and stretch', 'Take a gentle standing stretch break.', 'mobility', 'easy', 'self_report'),
  ('shoulder-rolls', 'Shoulder rolls', 'Roll your shoulders slowly five times each direction.', 'mobility', 'easy', 'self_report'),
  ('neck-reset', 'Neck reset', 'Gently turn your head side to side within a comfortable range.', 'mobility', 'easy', 'self_report'),
  ('wrist-circles', 'Wrist circles', 'Circle each wrist slowly ten times.', 'mobility', 'easy', 'self_report'),
  ('ankle-circles', 'Ankle circles', 'Circle each ankle slowly ten times.', 'mobility', 'easy', 'self_report'),
  ('hip-circles', 'Hip circles', 'Make five small, comfortable circles each way.', 'mobility', 'easy', 'self_report'),
  ('chest-opener', 'Chest opener', 'Gently open your arms and breathe for thirty seconds.', 'mobility', 'easy', 'self_report'),
  ('calf-stretch', 'Calf stretch', 'Hold a comfortable calf stretch for twenty seconds per side.', 'mobility', 'easy', 'self_report'),
  ('hamstring-stretch', 'Hamstring stretch', 'Stretch each hamstring gently for twenty seconds.', 'mobility', 'easy', 'self_report'),
  ('quad-stretch', 'Quad stretch', 'Stretch each quad gently for twenty seconds, using support if needed.', 'mobility', 'easy', 'self_report'),
  ('side-reach', 'Side reach', 'Reach to each side gently five times.', 'mobility', 'easy', 'self_report'),
  ('spine-reset', 'Spine reset', 'Gently round and extend your back five times while seated or standing.', 'mobility', 'easy', 'self_report'),
  ('deep-breaths', 'Five calm breaths', 'Pause and take five slow, comfortable breaths.', 'recovery', 'easy', 'self_report'),
  ('rest-check', 'Recovery check-in', 'Take one minute to notice how your body feels today.', 'recovery', 'easy', 'self_report'),
  ('water-break', 'Water break', 'Take a water break when you are thirsty.', 'recovery', 'easy', 'self_report'),
  ('screen-break', 'Screen break', 'Step away from a screen and move gently for two minutes.', 'recovery', 'easy', 'self_report'),
  ('early-wind-down', 'Wind down', 'Give yourself ten quiet minutes before bed.', 'recovery', 'easy', 'self_report'),
  ('outdoor-air', 'Fresh air', 'Spend five comfortable minutes outside, if accessible.', 'recovery', 'easy', 'self_report'),
  ('posture-reset', 'Posture reset', 'Sit or stand comfortably tall and relax your shoulders.', 'recovery', 'easy', 'self_report'),
  ('slow-exhale', 'Slow exhales', 'Take five easy breaths with a slightly longer exhale.', 'recovery', 'easy', 'self_report'),
  ('balance-support', 'Supported balance', 'Stand on each foot for ten seconds, holding support as needed.', 'balance', 'easy', 'self_report'),
  ('heel-toe', 'Heel-to-toe steps', 'Take ten slow heel-to-toe steps near a stable support.', 'balance', 'easy', 'self_report'),
  ('toe-raises', 'Toe raises', 'Raise your toes ten times while standing with support or seated.', 'balance', 'easy', 'self_report'),
  ('calf-raises', 'Calf raises', 'Do ten comfortable calf raises with support.', 'balance', 'easy', 'self_report'),
  ('sit-to-stand', 'Sit to stand', 'Stand up and sit down five times at a comfortable pace.', 'strength', 'easy', 'self_report'),
  ('wall-pushups', 'Wall push-ups', 'Try five comfortable wall push-ups.', 'strength', 'easy', 'self_report'),
  ('glute-squeezes', 'Glute squeezes', 'Squeeze and relax your glutes ten times.', 'strength', 'easy', 'self_report'),
  ('seated-knee-lifts', 'Seated knee lifts', 'Lift each knee gently five times while seated.', 'strength', 'easy', 'self_report'),
  ('arm-circles', 'Arm circles', 'Make ten small circles with your arms each direction.', 'strength', 'easy', 'self_report'),
  ('supported-squat', 'Supported squats', 'Try five shallow squats using a stable support.', 'strength', 'easy', 'self_report'),
  ('step-back', 'Step-backs', 'Step one foot back and return five times per side, holding support.', 'balance', 'easy', 'self_report'),
  ('gentle-core', 'Core brace', 'Gently brace your core for five comfortable breaths.', 'strength', 'easy', 'self_report'),
  ('warm-up', 'Warm-up first', 'Before your workout, move gently for five minutes.', 'training', 'training', 'self_report'),
  ('cool-down', 'Cool-down finish', 'After training, take five easy minutes to cool down.', 'training', 'training', 'self_report'),
  ('form-focus', 'Form focus', 'Choose one exercise and keep every rep controlled today.', 'training', 'training', 'self_report'),
  ('leave-one-rep', 'One rep in reserve', 'On one working set, stop while you could still do another clean rep.', 'training', 'training', 'self_report'),
  ('train-with-plan', 'Follow your plan', 'Complete a workout from your plan and log it.', 'training', 'training', 'workout'),
  ('log-a-workout', 'Log a workout', 'Complete and log any workout today.', 'training', 'training', 'workout'),
  ('gym-check-in', 'Gym check-in', 'Check in at the gym today.', 'training', 'training', 'gym_visit'),
  ('gym-show-up', 'Show up', 'Visit the gym and check in; a light session counts.', 'training', 'training', 'gym_visit'),
  ('lower-body-focus', 'Lower-body focus', 'Add a comfortable lower-body movement to your session.', 'training', 'training', 'self_report'),
  ('upper-body-focus', 'Upper-body focus', 'Add a comfortable upper-body movement to your session.', 'training', 'training', 'self_report');

create table community_private.daily_challenge_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  challenge_slug text not null references community_private.daily_challenge_catalog(slug),
  training_day boolean not null,
  rerolls_used smallint not null default 0 check (rerolls_used between 0 and 1),
  completed_at timestamptz,
  primary key (user_id, challenge_date)
);
create index daily_challenge_recent_idx on community_private.daily_challenge_assignments(user_id, challenge_date desc);
alter table community_private.daily_challenge_assignments enable row level security;
revoke all on community_private.daily_challenge_assignments from public, anon, authenticated;

create function community_private.daily_challenge_completion(
  p_user_id uuid, p_day date, p_kind text, p_manual_at timestamptz
) returns timestamptz language sql stable security definer set search_path = '' as $$
  select case p_kind
    when 'self_report' then p_manual_at
    when 'workout' then (select min(log.completed_at) from public.client_workout_logs log
      join auth.users member on member.id = p_user_id
      where lower(log.client_email) = lower(member.email) and log.entry_date = p_day
        and log.completed_at is not null)
    when 'gym_visit' then (select min(checkin.created_at) from public.client_gym_checkins checkin
      join auth.users member on member.id = p_user_id
      where lower(checkin.client_email) = lower(member.email) and checkin.entry_date = p_day)
  end;
$$;
revoke all on function community_private.daily_challenge_completion(uuid,date,text,timestamptz) from public, anon, authenticated;

create function community_private.community_daily_challenge(
  p_local_day date, p_action text default 'draw', p_training_day boolean default false
) returns table (challenge_date date, slug text, title text, instruction text, category text,
  effort text, completion_kind text, training_day boolean, rerolls_used smallint, completed boolean)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing community_private.daily_challenge_assignments%rowtype; chosen text;
begin
  if actor is null or (select public.is_coach_admin()) then raise exception 'Sign in as a client'; end if;
  if p_local_day is null or p_local_day < current_date - 1 or p_local_day > current_date + 1 then
    raise exception 'Choose your current local day';
  end if;
  if p_action not in ('draw', 'reroll') then raise exception 'Invalid action'; end if;
  if not exists (select 1 from public.client_community_profiles where user_id = actor) then
    raise exception 'Join Community before drawing a challenge';
  end if;
  -- Serialize concurrent taps; the assignment remains stable for the day.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_local_day::text, 0));
  select * into existing from community_private.daily_challenge_assignments a
    where a.user_id = actor and a.challenge_date = p_local_day for update;
  if existing.user_id is null or (p_action = 'reroll' and existing.rerolls_used = 0
      and community_private.daily_challenge_completion(actor, p_local_day,
        (select c.completion_kind from community_private.daily_challenge_catalog c where c.slug = existing.challenge_slug),
        existing.completed_at) is null) then
    select c.slug into chosen from community_private.daily_challenge_catalog c
      where (coalesce(p_training_day, false) or c.effort = 'easy')
        and (existing.user_id is null or c.slug <> existing.challenge_slug)
        and not exists (select 1 from community_private.daily_challenge_assignments prior
          where prior.user_id = actor and prior.challenge_slug = c.slug
            and prior.challenge_date >= p_local_day - 14 and prior.challenge_date < p_local_day)
      order by random() limit 1;
    if chosen is null then raise exception 'No challenge available'; end if;
    if existing.user_id is null then
      insert into community_private.daily_challenge_assignments(user_id,challenge_date,challenge_slug,training_day)
        values(actor,p_local_day,chosen,coalesce(p_training_day,false));
    else
      update community_private.daily_challenge_assignments
        set challenge_slug = chosen, rerolls_used = 1, training_day = coalesce(p_training_day,false)
        where user_id = actor and challenge_date = p_local_day;
    end if;
  end if;
  return query select a.challenge_date,c.slug,c.title,c.instruction,c.category,c.effort,c.completion_kind,a.training_day,
    a.rerolls_used,
    community_private.daily_challenge_completion(actor,a.challenge_date,c.completion_kind,a.completed_at) is not null
    from community_private.daily_challenge_assignments a
    join community_private.daily_challenge_catalog c on c.slug = a.challenge_slug
    where a.user_id = actor and a.challenge_date = p_local_day;
end;
$$;
revoke all on function community_private.community_daily_challenge(date,text,boolean) from public, anon;
grant execute on function community_private.community_daily_challenge(date,text,boolean) to authenticated;
create function public.community_daily_challenge(
  p_local_day date, p_action text default 'draw', p_training_day boolean default false
) returns table (challenge_date date, slug text, title text, instruction text, category text,
  effort text, completion_kind text, training_day boolean, rerolls_used smallint, completed boolean)
language sql security invoker set search_path = '' as $$
  select * from community_private.community_daily_challenge(p_local_day,p_action,p_training_day);
$$;
revoke all on function public.community_daily_challenge(date,text,boolean) from public, anon;
grant execute on function public.community_daily_challenge(date,text,boolean) to authenticated;

create function community_private.community_complete_daily_challenge(p_local_day date)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null or (select public.is_coach_admin()) then raise exception 'Sign in as a client'; end if;
  if p_local_day is null or p_local_day < current_date - 1 or p_local_day > current_date + 1 then return false; end if;
  update community_private.daily_challenge_assignments a set completed_at = now()
    from community_private.daily_challenge_catalog c
    where a.user_id = actor and a.challenge_date = p_local_day and a.challenge_slug = c.slug
      and c.completion_kind = 'self_report' and a.completed_at is null;
  return found;
end;
$$;
revoke all on function community_private.community_complete_daily_challenge(date) from public, anon;
grant execute on function community_private.community_complete_daily_challenge(date) to authenticated;
create function public.community_complete_daily_challenge(p_local_day date)
returns boolean language sql security invoker set search_path = '' as $$
  select community_private.community_complete_daily_challenge(p_local_day);
$$;
revoke all on function public.community_complete_daily_challenge(date) from public, anon;
grant execute on function public.community_complete_daily_challenge(date) to authenticated;

create function community_private.community_daily_wins()
returns table (nickname text, avatar_id text, title text, category text)
language sql stable security definer set search_path = '' as $$
  select profile.display_name,profile.avatar_id,c.title,c.category
  from community_private.daily_challenge_assignments a
  join community_private.daily_challenge_catalog c on c.slug = a.challenge_slug
  join public.client_community_preferences pref on pref.user_id = a.user_id and pref.daily_challenge_opt_in
  join public.client_community_profiles profile on profile.user_id = a.user_id
  where (select auth.uid()) is not null and not (select public.is_coach_admin())
    and a.challenge_date >= current_date - 1
    and community_private.daily_challenge_completion(a.user_id,a.challenge_date,c.completion_kind,a.completed_at) is not null
  order by a.challenge_date desc, profile.display_name
  limit 50;
$$;
revoke all on function community_private.community_daily_wins() from public, anon;
grant execute on function community_private.community_daily_wins() to authenticated;
create function public.community_daily_wins()
returns table (nickname text, avatar_id text, title text, category text)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_daily_wins();
$$;
revoke all on function public.community_daily_wins() from public, anon;
grant execute on function public.community_daily_wins() to authenticated;
