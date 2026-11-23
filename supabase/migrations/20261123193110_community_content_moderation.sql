-- Community content safety is enforced where all clients read and write shared activity.
create table community_private.member_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index member_blocks_blocked_id_idx on community_private.member_blocks (blocked_id, blocker_id);
alter table community_private.member_blocks enable row level security;

create table community_private.content_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  content_kind text not null check (content_kind in ('wall_post', 'wall_comment', 'profile')),
  content_id text not null check (char_length(content_id) between 1 and 140),
  reason text not null check (reason in ('harassment', 'inappropriate', 'spam', 'other')),
  details text check (char_length(details) <= 500),
  content_excerpt text check (char_length(content_excerpt) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  resolution text check (resolution in ('dismissed', 'hidden')),
  unique (reporter_id, content_kind, content_id),
  check (reporter_id <> member_id)
);

create index content_reports_member_id_idx on community_private.content_reports (member_id);
create index content_reports_reviewed_by_idx on community_private.content_reports (reviewed_by);
create index content_reports_pending_idx on community_private.content_reports (created_at) where reviewed_at is null;
alter table community_private.content_reports enable row level security;

create table community_private.content_removals (
  content_kind text not null,
  content_id text not null,
  member_id uuid not null references auth.users(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (content_kind, content_id)
);

create index content_removals_member_id_idx on community_private.content_removals (member_id);
alter table community_private.content_removals enable row level security;

revoke all on community_private.member_blocks, community_private.content_reports,
  community_private.content_removals from public, anon, authenticated;

-- Keep the list limited to clear policy violations. Ambiguous content goes through reports.
create function community_private.objectionable_text(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    normalize(p_text, NFKC) ~* '\m(kill[[:space:][:punct:]]+yourself|k[i1]ke|f[a@]gg?[o0]ts?|n[i1]gg[ae][rs]*|ch[i1]nks?|send[[:space:]]+nudes)\M',
    false
  );
$$;

create function community_private.filter_shared_text()
returns trigger language plpgsql set search_path = '' as $$
begin
  if community_private.objectionable_text(to_jsonb(new) ->> tg_argv[0]) then
    raise exception using errcode = '22023', message = 'This text can’t be shared. Edit it and try again.';
  end if;
  return new;
end;
$$;

create trigger filter_community_comment_text
before insert or update of body on community_private.community_wall_comments
for each row execute function community_private.filter_shared_text('body');

create trigger filter_community_profile_text
before insert or update of display_name on public.client_community_profiles
for each row execute function community_private.filter_shared_text('display_name');

create function community_private.actors_are_blocked(p_first uuid, p_second uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from community_private.member_blocks
    where (blocker_id = p_first and blocked_id = p_second)
       or (blocker_id = p_second and blocked_id = p_first)
  );
$$;

create function community_private.viewer_can_see_member(p_member uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() = p_member or (
    (select auth.uid()) is not null
    and not community_private.actors_are_blocked((select auth.uid()), p_member)
    and not exists (select 1 from community_private.content_removals removal
      where removal.content_kind = 'profile' and removal.content_id = p_member::text)
    and not exists (select 1 from public.client_community_profiles profile
      where profile.user_id = p_member and community_private.objectionable_text(profile.display_name))
  );
$$;

create policy "Hide blocked community connections" on public.client_community_connections
as restrictive for select to authenticated using (
  community_private.viewer_can_see_member(case when user_a = (select auth.uid()) then user_b else user_a end)
);

create policy "Hide blocked community profiles" on public.client_community_profiles
as restrictive for select to authenticated using (community_private.viewer_can_see_member(user_id));

create function community_private.viewer_can_see_content(p_kind text, p_content text)
returns boolean language sql stable set search_path = '' as $$
  select not exists (select 1 from community_private.content_removals removal
    where removal.content_kind = p_kind and removal.content_id = p_content);
$$;

create function community_private.member_is_visible_for_moderation(p_member uuid)
returns boolean language sql stable set search_path = '' as $$
  select community_private.viewer_can_see_member(p_member) and (
    exists (select 1 from public.client_community_connections connection
      where (select auth.uid()) in (connection.user_a, connection.user_b)
        and p_member in (connection.user_a, connection.user_b))
    or exists (select 1 from community_private.community_wall_events() event
      where event.owner_id = p_member and event.occurred_at between now() - interval '72 hours' and now())
    or exists (select 1 from community_private.community_wall_comments comment
      where comment.author_id = p_member
        and community_private.viewer_can_see_content('wall_comment', comment.id::text)
        and not community_private.objectionable_text(comment.body)
        and community_private.community_wall_comment_event_is_visible(comment.event_id))
  );
$$;

create function community_private.community_report_content(
  p_content_kind text, p_content_id text, p_reason text, p_details text
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  member uuid;
  excerpt text;
  details text := nullif(btrim(p_details), '');
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception using errcode = '42501', message = 'Sign in to report content.';
  end if;
  if p_content_id is null or char_length(p_content_id) not between 1 and 140
    or p_reason is null or p_reason not in ('harassment', 'inappropriate', 'spam', 'other')
    or char_length(details) > 500 then
    raise exception using errcode = '22023', message = 'Choose a reason and use up to 500 characters.';
  end if;

  case p_content_kind
    when 'wall_post' then
      select event.owner_id, coalesce(workout.title, event.headline) into member, excerpt
      from community_private.community_wall_events() event
      left join lateral community_private.community_wall_workout_summaries(array[event.event_id]) workout
        on event.event_type = 'workout'
      where event.event_id = p_content_id
        and community_private.community_wall_comment_event_is_visible(event.event_id);
    when 'wall_comment' then
      select comment.author_id, comment.body into member, excerpt from community_private.community_wall_comments comment
      where comment.id::text = p_content_id
        and community_private.viewer_can_see_member(comment.author_id)
        and community_private.viewer_can_see_content('wall_comment', comment.id::text)
        and not community_private.objectionable_text(comment.body)
        and community_private.community_wall_comment_event_is_visible(comment.event_id);
    when 'profile' then
      select profile.user_id, profile.display_name into member, excerpt from public.client_community_profiles profile
      where profile.user_id::text = p_content_id
        and community_private.member_is_visible_for_moderation(profile.user_id);
    else
      raise exception using errcode = '22023', message = 'Unsupported content type.';
  end case;

  if member is null or actor = member then
    raise exception using errcode = '42501', message = 'This content is unavailable to report.';
  end if;

  -- Serialize only a single member's report writes so retries and the rate limit agree.
  perform pg_advisory_xact_lock(hashtextextended('community-report:' || actor::text, 0));
  if exists (select 1 from community_private.content_reports report
    where report.reporter_id = actor and report.content_kind = p_content_kind and report.content_id = p_content_id) then
    return;
  end if;
  if (select count(*) from community_private.content_reports report
    where report.reporter_id = actor and report.created_at >= now() - interval '1 day') >= 30 then
    raise exception using errcode = 'P0001', message = 'You’ve reached the daily report limit. Contact support if you need help.';
  end if;
  insert into community_private.content_reports (reporter_id, member_id, content_kind, content_id, reason, details, content_excerpt)
    values (actor, member, p_content_kind, p_content_id, p_reason, details, left(excerpt, 500));
end;
$$;

create function community_private.community_block_member(p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true'
    or p_member_id is null or actor = p_member_id then
    raise exception using errcode = '42501', message = 'This member is unavailable to block.';
  end if;
  if exists (select 1 from community_private.member_blocks
    where blocker_id = actor and blocked_id = p_member_id) then
    return;
  end if;
  if not community_private.member_is_visible_for_moderation(p_member_id) then
    raise exception using errcode = '42501', message = 'This member is unavailable to block.';
  end if;

  insert into community_private.member_blocks (blocker_id, blocked_id)
    values (actor, p_member_id) on conflict do nothing;
end;
$$;

create function community_private.community_unblock_member(p_member_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from community_private.member_blocks
    where blocker_id = (select auth.uid()) and blocked_id = p_member_id;
$$;

create function community_private.community_blocked_members()
returns table (user_id uuid, nickname text)
language sql stable security definer set search_path = '' as $$
  select block.blocked_id,
    case when community_private.objectionable_text(profile.display_name) then 'Member'
         else coalesce(profile.display_name, 'Member') end
  from community_private.member_blocks block
  left join public.client_community_profiles profile on profile.user_id = block.blocked_id
  where block.blocker_id = (select auth.uid())
  order by block.created_at desc;
$$;

create function public.community_report_content(
  p_content_kind text, p_content_id text, p_reason text, p_details text default null
)
returns void language sql security invoker set search_path = '' as $$
  select community_private.community_report_content(p_content_kind, p_content_id, p_reason, p_details);
$$;

create function public.community_block_member(p_member_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select community_private.community_block_member(p_member_id);
$$;

create function public.community_unblock_member(p_member_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select community_private.community_unblock_member(p_member_id);
$$;

create function public.community_blocked_members()
returns table (user_id uuid, nickname text)
language sql stable security invoker set search_path = '' as $$
  select * from community_private.community_blocked_members();
$$;

revoke execute on function
  community_private.actors_are_blocked(uuid, uuid),
  community_private.viewer_can_see_member(uuid),
  community_private.viewer_can_see_content(text, text),
  community_private.member_is_visible_for_moderation(uuid),
  community_private.community_report_content(text, text, text, text),
  community_private.community_block_member(uuid),
  community_private.community_unblock_member(uuid),
  community_private.community_blocked_members(),
  public.community_report_content(text, text, text, text),
  public.community_block_member(uuid),
  public.community_unblock_member(uuid),
  public.community_blocked_members()
  from public, anon, authenticated;

grant execute on function
  community_private.viewer_can_see_member(uuid),
  community_private.community_report_content(text, text, text, text),
  community_private.community_block_member(uuid),
  community_private.community_unblock_member(uuid),
  community_private.community_blocked_members(),
  public.community_report_content(text, text, text, text),
  public.community_block_member(uuid),
  public.community_unblock_member(uuid),
  public.community_blocked_members()
  to authenticated;

-- Process reports from the operator's SQL session or a service-side report queue;
-- ordinary app accounts never see report identities or gain moderation privileges.
grant select on community_private.content_reports to service_role;

create function public.resolve_community_content_report(p_report_id bigint, p_hide boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  report community_private.content_reports%rowtype;
begin
  if p_hide is null then
    raise exception using errcode = '22023', message = 'Choose a resolution.';
  end if;
  select * into strict report from community_private.content_reports where id = p_report_id for update;
  if report.reviewed_at is not null then
    return;
  end if;
  if p_hide then
    insert into community_private.content_removals (content_kind, content_id, member_id)
      values (report.content_kind, report.content_id, report.member_id) on conflict do nothing;
  end if;
  update community_private.content_reports
    set reviewed_at = now(), reviewed_by = auth.uid(), resolution = case when p_hide then 'hidden' else 'dismissed' end
    where id = p_report_id;
end;
$$;

grant usage on schema community_private to service_role;
grant update on community_private.content_reports to service_role;
grant insert on community_private.content_removals to service_role;
revoke execute on function public.resolve_community_content_report(bigint, boolean) from public, anon, authenticated;
grant execute on function public.resolve_community_content_report(bigint, boolean) to service_role;

-- Photos are private until a moderator approves the exact uploaded file.
create table community_private.avatar_reviews (
  member_id uuid not null references auth.users(id) on delete cascade,
  photo_path text not null,
  submitted_at timestamptz not null default now(),
  approved boolean,
  decided_at timestamptz,
  primary key (member_id, photo_path)
);

alter table community_private.avatar_reviews enable row level security;
revoke all on community_private.avatar_reviews from public, anon, authenticated;
grant select, update on community_private.avatar_reviews to service_role;

create function community_private.avatar_approved(p_member uuid, p_path text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from community_private.avatar_reviews review
    where review.member_id = p_member and review.photo_path = p_path and review.approved = true
  );
$$;

create function community_private.queue_avatar_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.avatar_photo_path is not null then
    if not community_private.community_avatar_owned_path(new.user_id, new.avatar_photo_path)
      or not exists (select 1 from storage.objects object
        where object.bucket_id = 'community-avatars'
          and object.name = new.avatar_photo_path and object.owner_id = new.user_id::text) then
      raise exception using errcode = '42501', message = 'Choose a photo you uploaded to Community.';
    end if;
    insert into community_private.avatar_reviews (member_id, photo_path)
      values (new.user_id, new.avatar_photo_path) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger queue_community_avatar_review
after insert or update of avatar_photo_path on public.client_community_profiles
for each row execute function community_private.queue_avatar_review();

insert into community_private.avatar_reviews (member_id, photo_path)
  select profile.user_id, profile.avatar_photo_path
  from public.client_community_profiles profile
  join storage.objects object on object.bucket_id = 'community-avatars'
    and object.name = profile.avatar_photo_path and object.owner_id = profile.user_id::text
  where community_private.community_avatar_owned_path(profile.user_id, profile.avatar_photo_path)
  on conflict do nothing;

create function public.resolve_community_avatar_review(p_member_id uuid, p_photo_path text, p_approve boolean)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  if p_approve is null then
    raise exception using errcode = '22023', message = 'Choose a resolution.';
  end if;
  update community_private.avatar_reviews
    set approved = p_approve, decided_at = now()
    where member_id = p_member_id and photo_path = p_photo_path;
  return found;
end;
$$;

revoke execute on function public.resolve_community_avatar_review(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.resolve_community_avatar_review(uuid, text, boolean) to service_role;

-- Existing API signatures are preserved so older versions and the web use the same controls.
CREATE OR REPLACE FUNCTION community_private.community_wall_events()
 RETURNS TABLE(event_id text, owner_id uuid, nickname text, avatar_id text, event_type text, headline text, occurred_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with eligible as (
    select profile.user_id, profile.display_name, profile.avatar_id,
      lower(member.email) as email, pref.public_progress_opt_in,
      pref.workout_count_opt_in, pref.gym_visits_opt_in, pref.daily_challenge_opt_in,
      pref.wall_activity_opt_in, pref.weekly_challenge_opt_in
    from public.client_community_profiles profile
    join public.client_community_preferences pref on pref.user_id = profile.user_id
    join auth.users member on member.id = profile.user_id
    where (select auth.uid()) is not null
      and community_private.viewer_can_see_member(profile.user_id)
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
  select event.* from (
    select * from gym_events
    union all select * from workout_events
    union all select * from daily_events
    union all select * from weekly_events
  ) event(event_id, owner_id, nickname, avatar_id, event_type, headline, occurred_at)
  where community_private.viewer_can_see_content('wall_post', event.event_id);
$function$;

CREATE OR REPLACE FUNCTION community_private.community_wall_comments(p_event_id text)
 RETURNS TABLE(id uuid, user_id uuid, nickname text, avatar_id text, body text, created_at timestamp with time zone, is_own boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true'
    or p_event_id is null or char_length(p_event_id) not between 1 and 140
    or not community_private.community_wall_comment_event_is_visible(p_event_id) then
    return;
  end if;

  return query
  select recent.id, recent.author_id, author.display_name, author.avatar_id,
    recent.body, recent.created_at, recent.author_id = actor
  from (
    select comment.id, comment.author_id, comment.body, comment.created_at
    from community_private.community_wall_comments comment
    where comment.event_id = p_event_id
      and community_private.viewer_can_see_member(comment.author_id)
      and community_private.viewer_can_see_content('wall_comment', comment.id::text)
      and not community_private.objectionable_text(comment.body)
    order by comment.created_at desc, comment.id desc
    limit 100
  ) recent
  join public.client_community_profiles author on author.user_id = recent.author_id
  order by recent.created_at, recent.id;
end;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_wall_feed()
 RETURNS TABLE(event_id text, nickname text, avatar_id text, event_type text, headline text, occurred_at timestamp with time zone, props_count integer, gave_props boolean, can_give_props boolean, is_own boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select event.event_id, event.nickname, event.avatar_id, event.event_type,
    event.headline, event.occurred_at,
    (select count(*)::integer from community_private.community_wall_props props
      where props.event_id = event.event_id
        and not community_private.actors_are_blocked((select auth.uid()), props.sender_id)),
    exists (select 1 from community_private.community_wall_props props
      where props.event_id = event.event_id and props.sender_id = (select auth.uid())),
    event.owner_id <> (select auth.uid()) and (
      (select public.is_coach_admin()) or exists (
        select 1 from public.client_community_profiles viewer
        where viewer.user_id = (select auth.uid()))),
    event.owner_id = (select auth.uid())
  from community_private.community_wall_events() event
  order by event.occurred_at desc, event.event_id
  limit 100;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_wall_workout_summaries(p_event_ids text[])
 RETURNS TABLE(event_id text, title text, minutes integer, sets integer, volume_lb numeric, exercises jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where exercise.position <= 3 and not community_private.objectionable_text(exercise.exercise_name)
    group by exercise.event_id
  )
  select summary.event_id,
    case when not community_private.objectionable_text(summary.title) then summary.title end,
    summary.minutes, summary.sets, summary.volume_lb,
    coalesce(preview.previews, '[]'::jsonb)
  from session_totals summary
  left join exercise_previews preview on preview.event_id = summary.event_id;
end;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_connection_peer_profiles()
 RETURNS TABLE(user_id uuid, display_name text, avatar_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with caller as (
    select auth.uid() as id
    where (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  )
  select profile.user_id, profile.display_name, profile.avatar_id
  from caller
  join public.client_community_connections connection on caller.id in (connection.user_a, connection.user_b)
  join public.client_community_profiles profile
    on profile.user_id = case when caller.id = connection.user_a then connection.user_b else connection.user_a end
  where community_private.viewer_can_see_member(profile.user_id);
$function$;

CREATE OR REPLACE FUNCTION community_private.community_public_progress()
 RETURNS TABLE(nickname text, avatar_id text, xp integer, badge_ids text[], workout_count integer, gym_visit_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and community_private.viewer_can_see_member(profile.user_id)
    and choice.public_progress_opt_in
    and (choice.gym_visits_opt_in or (
      achievement.user_id is not null
      and (choice.xp_opt_in or choice.badges_opt_in or choice.workout_count_opt_in)
    ))
  order by coalesce(achievement.updated_at, profile.created_at) desc, profile.user_id
  limit 100;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_shared_progress()
 RETURNS TABLE(user_id uuid, xp integer, badge_ids text[], workout_count integer, gym_visit_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where (select auth.uid()) is not null
    and community_private.viewer_can_see_member(p.user_id);
$function$;

CREATE OR REPLACE FUNCTION community_private.community_daily_wins()
 RETURNS TABLE(nickname text, avatar_id text, title text, category text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select profile.display_name,profile.avatar_id,c.title,c.category
  from community_private.daily_challenge_assignments a
  join community_private.daily_challenge_catalog c on c.slug = a.challenge_slug
  join public.client_community_preferences pref on pref.user_id = a.user_id and pref.daily_challenge_opt_in
  join public.client_community_profiles profile on profile.user_id = a.user_id
  where (select auth.uid()) is not null and not (select public.is_coach_admin())
    and community_private.viewer_can_see_member(profile.user_id)
    and a.challenge_date >= current_date - 1
    and community_private.daily_challenge_completion(a.user_id,a.challenge_date,c.completion_kind,a.completed_at) is not null
  order by a.challenge_date desc, profile.display_name
  limit 50;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_weekly_leaderboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where community_private.viewer_can_see_member(profile.user_id)
      and not exists (
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
$function$;

CREATE OR REPLACE FUNCTION community_private.community_challenge_summary()
 RETURNS TABLE(id uuid, metric text, target_count integer, status text, peer_nickname text, peer_avatar_id text, incoming boolean, accepted_at timestamp with time zone, ends_at timestamp with time zone, my_count integer, peer_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and community_private.viewer_can_see_member(peer.user_id)
    and challenge.status in ('pending', 'accepted')
  order by challenge.created_at desc
  limit 50;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_request_circle(p_member_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  pair_a uuid;
  pair_b uuid;
  connection_id uuid;
begin
  if actor is null or (auth.jwt() ->> 'is_anonymous') = 'true'
    or not exists (select 1 from public.client_community_profiles profile where profile.user_id = actor) then
    raise exception using errcode = '42501', message = 'Join Community before sending a Circle request.';
  end if;

  if p_member_id is null or p_member_id = actor
    or not community_private.viewer_can_see_member(p_member_id) then
    raise exception using errcode = '42501', message = 'This member is not available for Circle requests.';
  end if;

  pair_a := least(actor, p_member_id);
  pair_b := greatest(actor, p_member_id);

  select connection.id into connection_id
  from public.client_community_connections connection
  where connection.user_a = pair_a and connection.user_b = pair_b;
  if connection_id is not null then
    return connection_id;
  end if;

  -- The feed supplies the visible set, and the internal projection supplies
  -- the authoritative owner without parsing event IDs or exposing profiles.
  if not exists (
    select 1
    from community_private.community_wall_feed() visible
    join community_private.community_wall_events() event on event.event_id = visible.event_id
    where event.owner_id = p_member_id
      and visible.occurred_at between now() - interval '72 hours' and now()
  ) then
    raise exception using errcode = '42501', message = 'This member is not available for Circle requests.';
  end if;

  insert into public.client_community_connections (user_a, user_b, requested_by, request_source)
  values (pair_a, pair_b, actor, 'circle')
  on conflict (user_a, user_b) do nothing
  returning id into connection_id;

  if connection_id is null then
    -- A concurrent request won the same pair. Preserve its sender and status.
    select connection.id into connection_id
    from public.client_community_connections connection
    where connection.user_a = pair_a and connection.user_b = pair_b;
  end if;
  if connection_id is null then
    raise exception using errcode = '42501', message = 'This member is not available for Circle requests.';
  end if;
  return connection_id;
exception
  when foreign_key_violation then
    raise exception using errcode = '42501', message = 'This member is not available for Circle requests.';
end;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_request_connection(p_invite_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if target is null or not community_private.viewer_can_see_member(target) then
    raise exception 'Invite code not found';
  end if;
  if exists (select 1 from public.client_community_connections
             where user_a = least(actor, target) and user_b = greatest(actor, target)) then
    raise exception 'A connection or invitation already exists';
  end if;
  insert into public.client_community_connections (user_a, user_b, requested_by)
    values (least(actor, target), greatest(actor, target), actor)
    returning id into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_accept_connection(p_connection_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid();
begin
  if actor is null then return false; end if;
  update public.client_community_connections set status = 'accepted', accepted_at = now()
    where id = p_connection_id and status = 'pending'
      and actor in (user_a, user_b) and requested_by <> actor
      and community_private.viewer_can_see_member(requested_by);
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_create_challenge(p_connection_id uuid, p_metric text, p_target_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if peer is null or not community_private.viewer_can_see_member(peer) then
    raise exception 'Connect before sending a challenge';
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION community_private.community_accept_challenge(p_challenge_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid();
begin
  if actor is null or (select public.is_coach_admin()) then return false; end if;
  update community_private.client_community_challenges challenge
    set status = 'accepted', accepted_at = now(), ends_at = now() + interval '7 days'
    from public.client_community_connections connection
    where challenge.id = p_challenge_id and challenge.status = 'pending'
      and challenge.recipient_id = actor
      and community_private.viewer_can_see_member(challenge.initiator_id)
      and connection.id = challenge.connection_id and connection.status = 'accepted'
      and actor in (connection.user_a, connection.user_b);
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION community_private.community_give_props(p_receiver_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor uuid := auth.uid();
  matched_connection uuid;
  inserted_id uuid;
begin
  if actor is null or p_receiver_id is null or actor = p_receiver_id
    or not community_private.viewer_can_see_member(p_receiver_id) then
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
$function$;

CREATE OR REPLACE FUNCTION community_private.community_props_summary()
 RETURNS TABLE(user_id uuid, received_count integer, sent_today boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  from visible v
  where community_private.viewer_can_see_member(v.user_id);
$function$;

CREATE OR REPLACE FUNCTION community_private.community_avatar_paths(p_user_ids uuid[])
 RETURNS TABLE(user_id uuid, avatar_photo_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select profile.user_id, profile.avatar_photo_path
  from public.client_community_profiles profile
  where (select auth.uid()) is not null
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and cardinality(p_user_ids) between 1 and 101
    and profile.user_id = any(p_user_ids)
    and profile.avatar_photo_path is not null
    and (profile.user_id = (select auth.uid())
      or (community_private.viewer_can_see_member(profile.user_id)
        and community_private.avatar_approved(profile.user_id, profile.avatar_photo_path)));
$function$;

CREATE OR REPLACE FUNCTION community_private.community_avatar_is_published(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (select auth.uid()) is not null
    and coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'false'
    and exists (
      select 1 from public.client_community_profiles profile
      where profile.avatar_photo_path = p_path
        and community_private.viewer_can_see_member(profile.user_id)
        and community_private.avatar_approved(profile.user_id, p_path)
    );
$function$;
