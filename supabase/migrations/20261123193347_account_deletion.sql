-- Keep the privileged implementation out of the API-visible schema.
create schema account_deletion_private;
revoke all on schema account_deletion_private from public, anon, authenticated;
grant usage on schema account_deletion_private to service_role;

-- The client may never supply a file path. Use the authenticated user's object
-- ownership and the private, verified UUID folders if an old service upload
-- has no owner. Exercise library media is not selected by folder or metadata.
create function account_deletion_private.storage_objects(p_account_id uuid)
returns table (bucket_id text, object_name text)
language sql stable security definer
set search_path = ''
as $$
  select object.bucket_id, object.name
    from storage.objects object
    where object.owner = p_account_id
       or object.owner_id = p_account_id::text
       or (
         object.owner is null and object.owner_id is null
         and object.bucket_id in ('apple-workouts', 'community-avatars', 'dexa-reports',
           'form-checks', 'gym-review-photos', 'progress-photos')
         and split_part(object.name, '/', 1) = p_account_id::text
         and strpos(object.name, '/') > 0
       );
$$;
revoke all on function account_deletion_private.storage_objects(uuid) from public, anon, authenticated;

create function account_deletion_private.require_client(p_account_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  client_email text;
  anonymous_account boolean;
  confirmed_at timestamptz;
  deleted_at timestamptz;
begin
  select lower(btrim(account.email)), account.is_anonymous, account.email_confirmed_at, account.deleted_at
    into client_email, anonymous_account, confirmed_at, deleted_at
    from auth.users account
    where account.id = p_account_id
    for update;
  if not found then
    return null;
  end if;
  -- The coach-account check matches the production public.is_coach_admin policy.
  if coalesce(client_email, '') in ('', 'benjaminbenz.fit@gmail.com')
    or coalesce(anonymous_account, false)
    or confirmed_at is null
    or deleted_at is not null then
    raise exception using errcode = '42501', message = 'Client account deletion is unavailable';
  end if;
  -- Email-linked legacy rows cannot be disambiguated if two Auth users share
  -- the address. Refuse to erase them in that case.
  if exists (
    select 1 from auth.users account
      where lower(btrim(account.email)) = client_email
        and account.id <> p_account_id and account.deleted_at is null
  ) then
    raise exception using errcode = '23505', message = 'Client ownership is ambiguous';
  end if;
  return client_email;
end;
$$;
revoke all on function account_deletion_private.require_client(uuid) from public, anon, authenticated;

create function account_deletion_private.list_objects(p_account_id uuid)
returns table (bucket_id text, object_name text)
language plpgsql security definer
set search_path = ''
as $$
begin
  if account_deletion_private.require_client(p_account_id) is not null then
    return query
      select path.bucket_id, path.object_name
      from account_deletion_private.storage_objects(p_account_id) path
      order by path.bucket_id, path.object_name
      limit 200;
  end if;
end;
$$;
revoke all on function account_deletion_private.list_objects(uuid) from public, anon, authenticated;
grant execute on function account_deletion_private.list_objects(uuid) to service_role;

create function account_deletion_private.finish(p_account_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  deleting_email text := account_deletion_private.require_client(p_account_id);
  legacy_table text;
begin
  -- The Edge Function has authenticated the caller before entering here. A
  -- concurrent completion can already have removed the row under the same ID.
  if deleting_email is null then
    return true;
  end if;
  if exists (select 1 from account_deletion_private.storage_objects(p_account_id)) then
    return false;
  end if;

  -- Remove content authored on other users' workout threads before deleting the
  -- Auth row, plus other users' comments attached to the deleted client's wall.
  delete from public.workout_comments where author_user_id = p_account_id;
  delete from public.workout_comment_threads thread
    where thread.client_user_id = p_account_id
      or (thread.client_user_id is null and lower(btrim(thread.client_email)) = deleting_email);
  delete from community_private.community_wall_comments comment
    where comment.author_id = p_account_id
      or (split_part(comment.event_id, ':', 1) in ('workout', 'gym', 'daily')
        and split_part(comment.event_id, ':', 2) = p_account_id::text)
      or (split_part(comment.event_id, ':', 1) = 'weekly'
        and split_part(comment.event_id, ':', 3) = p_account_id::text);
  delete from public.shared_food_library where created_by_user_id = p_account_id;

  delete from public.client_fitness_questionnaires form
    where form.linked_user_id = p_account_id
      or (form.linked_user_id is null and (
        lower(btrim(form.linked_client_email)) = deleting_email
        or (coalesce(btrim(form.linked_client_email), '') = ''
          and lower(btrim(form.respondent_email)) = deleting_email)
      ));
  delete from public.client_access_requests where lower(btrim(email)) = deleting_email;
  update public.client_access_requests set decided_by = null where decided_by = p_account_id;

  -- Clear linked coaching email outbox rows and the associated conversation.
  -- Auth cascade handles per-user cursors and device/notification outboxes.
  delete from messaging_private.email_outbox where lower(btrim(recipient_email)) = deleting_email;
  delete from messaging_private.messages where sender_user_id = p_account_id;
  delete from messaging_private.conversations
    where client_user_id = p_account_id or lower(btrim(client_email)) = deleting_email;

  delete from public.client_notifications
    where web_dedupe_key like 'client-login:' || p_account_id::text || ':%';

  -- These legacy tables store the normalized address rather than an Auth FK.
  -- Table identifiers are fixed, and the matched address came from auth.users.
  foreach legacy_table in array array[
    'ai_workout_recommendations', 'client_check_ins', 'client_fitbit_activity_syncs',
    'client_fitbit_connections', 'client_food_logs', 'client_google_health_activity_syncs',
    'client_gym_checkins', 'client_monthly_training_reports', 'client_programs',
    'client_progress', 'client_progress_notes', 'client_progress_photos',
    'client_workout_drafts', 'client_workout_logs', 'coach_requests', 'workout_session_feedback'
  ] loop
    execute format('delete from public.%I where lower(btrim(client_email)) = $1', legacy_table) using deleting_email;
  end loop;

  -- Delete the Auth identity in the same transaction as the legacy data.
  -- Existing FK cascades also revoke refresh sessions and erase UUID-owned
  -- profile, device, workout, achievements, integration, and health records.
  delete from auth.users where id = p_account_id;
  return found;
end;
$$;
revoke all on function account_deletion_private.finish(uuid) from public, anon, authenticated;
grant execute on function account_deletion_private.finish(uuid) to service_role;

-- API-visible RPCs are invoker-only, and clients have no execute privilege.
create function public.account_deletion_storage_objects(p_account_id uuid)
returns table (bucket_id text, object_name text)
language sql security invoker
set search_path = ''
as $$
  select * from account_deletion_private.list_objects(p_account_id);
$$;
revoke all on function public.account_deletion_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.account_deletion_storage_objects(uuid) to service_role;

create function public.finish_client_account_deletion(p_account_id uuid)
returns boolean
language sql security invoker
set search_path = ''
as $$
  select account_deletion_private.finish(p_account_id);
$$;
revoke all on function public.finish_client_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.finish_client_account_deletion(uuid) to service_role;

-- Supabase access tokens remain cryptographically valid until expiry after
-- account deletion. Require a current Auth row alongside existing policies
-- on legacy email data and Storage so a stale bearer cannot recreate it.
create function account_deletion_private.current_account_exists()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users account
      where account.id = (select auth.uid()) and account.deleted_at is null
  );
$$;
revoke all on function account_deletion_private.current_account_exists() from public, anon, authenticated;
grant usage on schema account_deletion_private to authenticated;
grant execute on function account_deletion_private.current_account_exists() to authenticated;

do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'ai_workout_recommendations', 'client_access_requests', 'client_apple_workouts',
    'client_check_ins', 'client_community_profiles', 'client_dexa_reports',
    'client_fitness_questionnaires', 'client_food_logs', 'client_gym_checkins',
    'client_monthly_training_reports', 'client_programs', 'client_progress',
    'client_progress_notes', 'client_progress_photos', 'client_workout_drafts',
    'client_workout_logs', 'coach_requests', 'form_check_submissions',
    'gym_review_photos', 'workout_comment_threads', 'workout_session_feedback'
  ] loop
    execute format(
      'create policy account_deletion_require_current_account on public.%I
        as restrictive for all to authenticated
        using ((select account_deletion_private.current_account_exists()))
        with check ((select account_deletion_private.current_account_exists()))',
      protected_table
    );
  end loop;
end;
$$;

create policy account_deletion_require_current_account on storage.objects
  as restrictive for all to authenticated
  using ((select account_deletion_private.current_account_exists()))
  with check ((select account_deletion_private.current_account_exists()));
