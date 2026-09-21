create table public.client_apple_workouts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null check (
    client_email = lower(btrim(client_email))
    and char_length(client_email) between 3 and 320 and position('@' in client_email) > 1
  ),
  history_key text not null check (char_length(history_key) between 12 and 1000),
  storage_path text not null unique check (
    split_part(storage_path, '/', 1) = owner_user_id::text
    and storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,220}$'
    and position('..' in storage_path) = 0
  ),
  original_filename text not null check (char_length(btrim(original_filename)) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 8388608),
  workout_date date not null,
  activity_type text check (activity_type is null or char_length(activity_type) between 1 and 160),
  duration_seconds integer check (duration_seconds between 0 and 604800),
  elapsed_seconds integer check (elapsed_seconds between 0 and 604800),
  active_calories numeric check (active_calories between 0 and 100000),
  total_calories numeric check (total_calories between 0 and 100000),
  average_heart_rate numeric check (average_heart_rate between 20 and 300),
  started_at_local time,
  ended_at_local time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_email, history_key)
);

comment on table public.client_apple_workouts is
  'Private Apple Workout screenshots and client-reviewed values attached to one existing workout. Missing values remain null; this table does not create a second workout.';

create index client_apple_workouts_owner_idx on public.client_apple_workouts (owner_user_id);
create index client_apple_workouts_client_date_idx on public.client_apple_workouts (client_email, workout_date desc);
create trigger set_client_apple_workouts_updated_at
before update on public.client_apple_workouts
for each row execute function public.set_updated_at();

-- Mirror clientWorkoutHistorySessionKey: session_id takes priority over
-- workout_session_id. Legacy keys are only valid for rows without either UUID.
create function public.owns_apple_workout_history(target_history_key text)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.client_workout_logs as log
    where lower(btrim(log.client_email)) = lower(btrim(auth.jwt()->>'email'))
      and target_history_key = case
        when coalesce(log.session_id, log.workout_session_id) is not null
          then 'session:' || coalesce(log.session_id, log.workout_session_id)::text
        else 'legacy:' || log.entry_date::text || '::' || lower(btrim(coalesce(nullif(log.workout_title, ''), 'Workout')))
      end
  );
$$;
revoke all on function public.owns_apple_workout_history(text) from public, anon;
grant execute on function public.owns_apple_workout_history(text) to authenticated;

alter table public.client_apple_workouts enable row level security;
revoke all on public.client_apple_workouts from public, anon, authenticated;
grant select, insert, update, delete on public.client_apple_workouts to authenticated;
grant all on public.client_apple_workouts to service_role;

create policy "Read own or coached Apple workouts"
on public.client_apple_workouts for select to authenticated
using (
  (owner_user_id = (select auth.uid()) and client_email = lower(btrim((select auth.jwt())->>'email')))
  or (select public.is_coach_admin())
);

create policy "Insert own reviewed Apple workouts"
on public.client_apple_workouts for insert to authenticated
with check (
  owner_user_id = (select auth.uid())
  and client_email = lower(btrim((select auth.jwt())->>'email'))
  and public.owns_apple_workout_history(history_key)
  and exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'apple-workouts' and object.name = storage_path
      and object.owner_id = (select auth.uid())::text
  )
);

create policy "Update own reviewed Apple workouts"
on public.client_apple_workouts for update to authenticated
using (owner_user_id = (select auth.uid()) and client_email = lower(btrim((select auth.jwt())->>'email')))
with check (
  owner_user_id = (select auth.uid())
  and client_email = lower(btrim((select auth.jwt())->>'email'))
  and public.owns_apple_workout_history(history_key)
  and exists (
    select 1 from storage.objects as object
    where object.bucket_id = 'apple-workouts' and object.name = storage_path
      and object.owner_id = (select auth.uid())::text
  )
);

create policy "Delete own Apple workouts"
on public.client_apple_workouts for delete to authenticated
using (owner_user_id = (select auth.uid()) and client_email = lower(btrim((select auth.jwt())->>'email')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('apple-workouts', 'apple-workouts', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Upload own Apple Workout screenshots"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'apple-workouts'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,220}$'
  and position('..' in name) = 0
);

-- New object paths are required for replacements: no UPDATE permission is given.
create policy "Read own or coached Apple Workout screenshots"
on storage.objects for select to authenticated
using (
  bucket_id = 'apple-workouts' and (
    (owner_id = (select auth.uid())::text and (storage.foldername(name))[1] = (select auth.uid())::text)
    or (select public.is_coach_admin())
  )
);

-- Delete metadata first, or switch it to the replacement path, before cleanup.
create policy "Clean up own unused Apple Workout screenshots"
on storage.objects for delete to authenticated
using (
  bucket_id = 'apple-workouts'
  and owner_id = (select auth.uid())::text
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1 from public.client_apple_workouts as attachment where attachment.storage_path = name
  )
);

-- A service-only atomic quota bounds model calls even across concurrent Edge
-- Function instances. One row per user is reused instead of retaining requests.
create schema if not exists private;
create table private.apple_workout_extraction_limits (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  quota_date date not null,
  attempts integer not null check (attempts between 1 and 20)
);
alter table private.apple_workout_extraction_limits enable row level security;
revoke all on private.apple_workout_extraction_limits from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update on private.apple_workout_extraction_limits to service_role;

create function public.consume_apple_workout_extraction(request_user_id uuid)
returns boolean
language plpgsql security invoker
set search_path = ''
as $$
declare
  accepted_user uuid;
  quota_day date := (now() at time zone 'UTC')::date;
begin
  if request_user_id is null then return false; end if;
  insert into private.apple_workout_extraction_limits as limits (owner_user_id, quota_date, attempts)
  values (request_user_id, quota_day, 1)
  on conflict (owner_user_id) do update
  set quota_date = quota_day,
      attempts = case when limits.quota_date = quota_day then limits.attempts + 1 else 1 end
  where limits.quota_date <> quota_day or limits.attempts < 20
  returning owner_user_id into accepted_user;
  return accepted_user is not null;
end;
$$;
revoke all on function public.consume_apple_workout_extraction(uuid) from public, anon, authenticated;
grant execute on function public.consume_apple_workout_extraction(uuid) to service_role;
