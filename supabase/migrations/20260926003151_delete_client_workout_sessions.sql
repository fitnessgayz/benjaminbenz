-- Deleting a saved session is atomic, owner-only, and durable across stale devices.
-- Uploaded health files and assigned/custom workout templates are not deleted.
create schema if not exists fwb_workout_private;
revoke all on schema fwb_workout_private from public, anon;
grant usage on schema fwb_workout_private to authenticated;

create table fwb_workout_private.deleted_sessions (
  client_email text not null,
  session_id uuid not null,
  legacy_session_id uuid,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  deleted_at timestamptz not null default now(),
  primary key (client_email, session_id),
  check (client_email = lower(btrim(client_email)))
);
create index deleted_sessions_legacy_idx
  on fwb_workout_private.deleted_sessions (client_email, legacy_session_id);
alter table fwb_workout_private.deleted_sessions enable row level security;
revoke all on fwb_workout_private.deleted_sessions from public, anon, authenticated;

-- This trigger also runs for service writers. A stale queue must never resurrect
-- a session after its owner deletes it. It sorts after the existing ID-fill trigger.
create function fwb_workout_private.reject_deleted_session_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  email_key text := lower(btrim(new.client_email));
  legacy_key uuid := md5(email_key || '|' || new.entry_date::text || '|' || lower(btrim(new.workout_title)))::uuid;
  session_key uuid := coalesce(new.session_id, legacy_key);
begin
  -- Shared by inserts and deletion; using the natural key covers clients whose
  -- requests omit session_id, as older website releases do.
  perform pg_advisory_xact_lock(hashtextextended(email_key || '|' || session_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(email_key || '|' || legacy_key::text, 0));
  if exists (
    select 1 from fwb_workout_private.deleted_sessions tombstone
    where tombstone.client_email = email_key
      and (tombstone.session_id = session_key or tombstone.legacy_session_id = session_key)
  ) then
    raise exception 'workout_session_deleted' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function fwb_workout_private.reject_deleted_session_write() from public, anon, authenticated;

create trigger zz_fwb_reject_deleted_workout_log
before insert or update on public.client_workout_logs
for each row execute function fwb_workout_private.reject_deleted_session_write();
create trigger zz_fwb_reject_deleted_workout_draft
before insert or update on public.client_workout_drafts
for each row execute function fwb_workout_private.reject_deleted_session_write();
create trigger zz_fwb_reject_deleted_workout_feedback
before insert or update on public.workout_session_feedback
for each row execute function fwb_workout_private.reject_deleted_session_write();

create function fwb_workout_private.delete_client_workout_session(
  p_session_id uuid default null,
  p_log_ids uuid[] default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  user_id uuid := auth.uid();
  email_key text := lower(btrim(coalesce(auth.jwt()->>'email', '')));
  session_key uuid := p_session_id;
  selected_count integer;
  distinct_sessions integer;
  matched_count integer;
  deleted_count integer;
  session_date date;
  session_title text;
  legacy_key uuid;
begin
  if user_id is null or email_key = '' then
    raise exception 'Sign in to delete a workout.' using errcode = '42501';
  end if;
  if (p_session_id is null) = (coalesce(cardinality(p_log_ids), 0) = 0) then
    raise exception 'Choose one workout to delete.' using errcode = '22023';
  end if;

  if p_session_id is null then
    if cardinality(p_log_ids) > 1000 or array_position(p_log_ids, null) is not null then
      raise exception 'Refresh your workout history and try again.' using errcode = '22023';
    end if;
    select count(distinct id) into selected_count from unnest(p_log_ids) as id;
    select count(*), count(distinct log.session_id), (array_agg(log.session_id))[1]
      into matched_count, distinct_sessions, session_key
    from public.client_workout_logs log
    where log.id = any(p_log_ids) and lower(btrim(log.client_email)) = email_key;
    if matched_count <> selected_count or distinct_sessions <> 1 or session_key is null then
      raise exception 'Refresh your workout history and try again.' using errcode = '22023';
    end if;
  end if;

  select log.entry_date, log.workout_title into session_date, session_title
  from public.client_workout_logs log
  where lower(btrim(log.client_email)) = email_key and log.session_id = session_key
  order by log.id limit 1;
  if not found then
    -- A repeated successful request is safe. Unknown or someone else's ID fails.
    if exists (select 1 from fwb_workout_private.deleted_sessions tombstone
      where tombstone.client_email = email_key and tombstone.session_id = session_key
        and tombstone.owner_user_id = user_id) then
      return jsonb_build_object('deleted_count', 0, 'session_id', session_key);
    end if;
    raise exception 'This workout could not be found. Refresh your history.' using errcode = '42501';
  end if;

  legacy_key := md5(email_key || '|' || session_date::text || '|' || lower(btrim(session_title)))::uuid;
  perform pg_advisory_xact_lock(hashtextextended(email_key || '|' || session_key::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(email_key || '|' || legacy_key::text, 0));
  -- A session's metadata must describe a single date/title before it is removed.
  if exists (select 1 from public.client_workout_logs log
    where lower(btrim(log.client_email)) = email_key and log.session_id = session_key
      and (log.entry_date <> session_date or lower(btrim(log.workout_title)) <> lower(btrim(session_title)))) then
    raise exception 'Refresh your workout history and try again.' using errcode = '22023';
  end if;

  insert into fwb_workout_private.deleted_sessions
    (client_email, session_id, legacy_session_id, owner_user_id)
  values (email_key, session_key,
    case when exists (select 1 from public.client_workout_logs surviving
      where lower(btrim(surviving.client_email)) = email_key
        and surviving.session_id = legacy_key and surviving.session_id <> session_key)
      then null else legacy_key end,
    user_id)
  on conflict (client_email, session_id) do nothing;

  delete from public.client_workout_logs log
  where lower(btrim(log.client_email)) = email_key and log.session_id = session_key;
  get diagnostics deleted_count = row_count;
  delete from public.client_workout_drafts draft
  where lower(btrim(draft.client_email)) = email_key and draft.session_id = session_key;
  delete from public.workout_session_feedback feedback
  where lower(btrim(feedback.client_email)) = email_key and feedback.session_id = session_key;
  return jsonb_build_object('deleted_count', deleted_count, 'session_id', session_key);
end;
$$;
revoke all on function fwb_workout_private.delete_client_workout_session(uuid, uuid[]) from public, anon;
grant execute on function fwb_workout_private.delete_client_workout_session(uuid, uuid[]) to authenticated;

create function public.delete_client_workout_session(
  p_session_id uuid default null,
  p_log_ids uuid[] default null
)
returns jsonb language sql security invoker set search_path = '' as $$
  select fwb_workout_private.delete_client_workout_session(p_session_id, p_log_ids);
$$;
revoke all on function public.delete_client_workout_session(uuid, uuid[]) from public, anon;
grant execute on function public.delete_client_workout_session(uuid, uuid[]) to authenticated;
comment on function public.delete_client_workout_session(uuid, uuid[]) is
  'Permanently removes one owned saved workout and its draft/ratings. Templates and uploaded health files remain. Repeated session-ID deletion is idempotent.';
