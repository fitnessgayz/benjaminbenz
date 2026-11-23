begin;
set local lock_timeout = '5s';

-- Keep every visible date/title group and its sets. An old ID must identify
-- none of the split groups, so deleting from cached history cannot pick the
-- wrong one. Older writers can still sync a group they can identify.
lock table public.client_workout_logs, public.client_workout_drafts,
  public.workout_session_feedback, public.workout_comment_threads,
  public.client_apple_workouts in share row exclusive mode;

create table fwb_workout_private.repaired_workout_history_ids (
  client_email text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  previous_session_id uuid not null,
  entry_date date not null,
  title_key text not null,
  session_id uuid not null unique,
  primary key (client_email, previous_session_id, entry_date, title_key)
);
alter table fwb_workout_private.repaired_workout_history_ids enable row level security;
revoke all on fwb_workout_private.repaired_workout_history_ids from public, anon, authenticated;

with affected as (
  select lower(btrim(client_email)) as client_email, session_id
  from public.client_workout_logs
  where session_id is not null
  group by 1, 2
  having count(distinct lower(btrim(workout_title))) > 1
    and count(distinct entry_date) = 1
    and count(distinct workout_template_id) = 1
    and bool_and(workout_template_id is not null and source = 'ios_app')
    and count(distinct completed_at) = 1
    and count(distinct lower(btrim(workout_title))) filter (where completed_at is not null) = 1
),
groups as (
  select distinct affected.client_email, affected.session_id, log.entry_date,
    lower(btrim(log.workout_title)) as title_key
  from affected
  join public.client_workout_logs log on log.session_id = affected.session_id
   and lower(btrim(log.client_email)) = affected.client_email
)
insert into fwb_workout_private.repaired_workout_history_ids
  (client_email, owner_user_id, previous_session_id, entry_date, title_key, session_id)
select groups.client_email, owner.id, groups.session_id, groups.entry_date, groups.title_key,
  md5(groups.client_email || '|' || groups.entry_date::text || '|' || groups.title_key)::uuid
from groups
left join auth.users owner on lower(btrim(owner.email)) = groups.client_email;

do $$
begin
  if exists (
    select 1 from fwb_workout_private.repaired_workout_history_ids fix
    where fix.session_id = fix.previous_session_id
      or exists (select 1 from public.client_workout_logs log where log.session_id = fix.session_id)
      or exists (select 1 from public.client_workout_drafts draft where draft.session_id = fix.session_id)
      or exists (select 1 from public.workout_session_feedback feedback where feedback.session_id = fix.session_id)
      or exists (
        select 1 from fwb_workout_private.deleted_sessions deleted
        where deleted.client_email = fix.client_email
          and (fix.session_id in (deleted.session_id, deleted.legacy_session_id)
            or fix.previous_session_id in (deleted.session_id, deleted.legacy_session_id))
      )
      or exists (
        select 1 from public.workout_comment_threads thread
        where thread.workout_session_id in (fix.previous_session_id, fix.session_id)
          and lower(btrim(thread.client_email)) = fix.client_email
      )
      or exists (
        select 1 from public.client_apple_workouts attachment
        where lower(btrim(attachment.client_email)) = fix.client_email
          and attachment.history_key in ('session:' || fix.previous_session_id, 'session:' || fix.session_id)
      )
      or exists (
        select 1 from public.client_workout_logs log
        where log.session_id = fix.previous_session_id
          and lower(btrim(log.client_email)) = fix.client_email and log.workout_session_id is not null
      )
  ) then
    raise exception 'Workout history repair encountered a linked or occupied session ID.';
  end if;
end;
$$;

update public.client_workout_logs log
set session_id = fix.session_id
from fwb_workout_private.repaired_workout_history_ids fix
where log.session_id = fix.previous_session_id and lower(btrim(log.client_email)) = fix.client_email
  and log.entry_date = fix.entry_date and lower(btrim(log.workout_title)) = fix.title_key;

update public.client_workout_drafts draft
set session_id = fix.session_id
from fwb_workout_private.repaired_workout_history_ids fix
where draft.session_id = fix.previous_session_id and lower(btrim(draft.client_email)) = fix.client_email
  and draft.entry_date = fix.entry_date and lower(btrim(draft.workout_title)) = fix.title_key;

update public.workout_session_feedback feedback
set session_id = fix.session_id
from fwb_workout_private.repaired_workout_history_ids fix
where feedback.session_id = fix.previous_session_id and lower(btrim(feedback.client_email)) = fix.client_email
  and feedback.entry_date = fix.entry_date and lower(btrim(feedback.workout_title)) = fix.title_key;

create function fwb_workout_private.route_repaired_workout_history_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  normalized_email text := lower(btrim(new.client_email));
  replacement_id uuid;
begin
  select fix.session_id into replacement_id
  from fwb_workout_private.repaired_workout_history_ids fix
  where fix.client_email = normalized_email and fix.previous_session_id = new.session_id
    and fix.entry_date = new.entry_date and fix.title_key = lower(btrim(new.workout_title));

  if found then
    new.session_id := replacement_id;
  elsif exists (
    select 1 from fwb_workout_private.repaired_workout_history_ids fix
    where fix.client_email = normalized_email and fix.previous_session_id = new.session_id
  ) then
    raise exception 'Refresh your workout history and try again.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function fwb_workout_private.route_repaired_workout_history_write() from public, anon, authenticated;

-- Run before the existing deletion guard so a deleted replacement cannot be
-- recreated by a stale writer still using the previous ID.
create trigger z_route_repaired_workout_log
before insert or update on public.client_workout_logs
for each row execute function fwb_workout_private.route_repaired_workout_history_write();
create trigger z_route_repaired_workout_draft
before insert or update on public.client_workout_drafts
for each row execute function fwb_workout_private.route_repaired_workout_history_write();
create trigger z_route_repaired_workout_feedback
before insert or update on public.workout_session_feedback
for each row execute function fwb_workout_private.route_repaired_workout_history_write();

commit;
