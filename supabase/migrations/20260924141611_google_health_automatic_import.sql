-- Inbound Google Health workouts remain separate from client-authored training logs.
-- Tokens, OAuth state, sync leases and scheduler credentials are service-only.
alter table public.client_google_health_connections
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists connection_id uuid not null default gen_random_uuid(),
  add column if not exists auto_sync_enabled boolean not null default false,
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_sync_attempt_at timestamptz,
  add column if not exists last_sync_error text,
  add column if not exists needs_reconnect boolean not null default false,
  add column if not exists sync_lease_id uuid,
  add column if not exists sync_lease_expires_at timestamptz,
  add column if not exists sync_lease_manual boolean not null default false;

update public.client_google_health_connections as connection
   set owner_user_id = account.id
  from auth.users as account
 where connection.owner_user_id is null
   and lower(btrim(connection.client_email)) = lower(btrim(account.email));

create unique index if not exists client_google_health_connections_generation_idx
  on public.client_google_health_connections (connection_id);
create index if not exists client_google_health_connections_owner_idx
  on public.client_google_health_connections (owner_user_id);
create index if not exists client_google_health_connections_sync_due_idx
  on public.client_google_health_connections (last_sync_attempt_at nulls first, client_email)
  where auto_sync_enabled and not needs_reconnect;

alter table public.client_google_health_oauth_states
  add column if not exists owner_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists redirect_uri text;
create index if not exists client_google_health_oauth_states_owner_idx
  on public.client_google_health_oauth_states (owner_user_id);

revoke all on public.client_google_health_connections from public, anon, authenticated;
revoke all on public.client_google_health_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.client_google_health_connections to service_role;
grant select, insert, update, delete on public.client_google_health_oauth_states to service_role;

create table public.client_google_health_workouts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null check (client_email = lower(btrim(client_email)) and char_length(client_email) between 3 and 320),
  source_name text not null check (char_length(source_name) between 1 and 512),
  workout_date date not null check (isfinite(workout_date)),
  activity_type text not null check (char_length(activity_type) between 1 and 160),
  started_at timestamptz not null check (isfinite(started_at)),
  ended_at timestamptz check (isfinite(ended_at) and ended_at >= started_at),
  duration_seconds numeric check (duration_seconds between 0 and 604800),
  elapsed_seconds numeric check (elapsed_seconds between 0 and 604800),
  calories numeric check (calories between 0 and 100000),
  distance_meters numeric check (distance_meters between 0 and 10000000),
  average_heart_rate numeric check (average_heart_rate between 20 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_google_health_workouts_duration_order check (elapsed_seconds is null or duration_seconds is null or elapsed_seconds >= duration_seconds),
  unique (owner_user_id, source_name)
);
create index client_google_health_workouts_client_date_idx
  on public.client_google_health_workouts (client_email, workout_date desc);
create index client_google_health_workouts_owner_date_idx
  on public.client_google_health_workouts (owner_user_id, workout_date desc);

alter table public.client_google_health_workouts enable row level security;
revoke all on public.client_google_health_workouts from public, anon, authenticated;
grant select on public.client_google_health_workouts to authenticated;
grant select, insert, update, delete on public.client_google_health_workouts to service_role;
create policy client_google_health_workouts_read
  on public.client_google_health_workouts for select to authenticated
  using (owner_user_id = (select auth.uid()) or (select public.is_coach_admin()));

create or replace function public.claim_google_health_sync(
  target_email text, target_connection_id uuid, p_manual boolean default false
) returns uuid
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare claimed_lease uuid;
begin
  update public.client_google_health_connections as connection
     set sync_lease_id = gen_random_uuid(),
         sync_lease_expires_at = clock_timestamp() + interval '2 minutes',
         sync_lease_manual = coalesce(p_manual, false),
         last_sync_attempt_at = clock_timestamp(),
         updated_at = clock_timestamp()
   where connection.client_email = lower(btrim(target_email))
     and connection.connection_id = target_connection_id
     and connection.owner_user_id is not null
     and (connection.auto_sync_enabled or coalesce(p_manual, false))
     and not connection.needs_reconnect
     and (connection.sync_lease_expires_at is null or connection.sync_lease_expires_at <= clock_timestamp())
     and exists (select 1 from public.client_programs as program
       where lower(btrim(program.client_email)) = connection.client_email
         and program.active is true and program.client_archived is not true)
  returning connection.sync_lease_id into claimed_lease;
  return claimed_lease;
end;
$$;

create or replace function public.commit_google_health_sync(
  target_email text, target_connection_id uuid, target_lease_id uuid, workouts jsonb,
  window_start timestamptz default null, window_end timestamptz default null
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  connection public.client_google_health_connections%rowtype;
  imported_count integer := 0;
  updated_count integer := 0;
  deleted_count integer := 0;
  rejected constant jsonb := '{"committed":false,"imported":0,"updated":0,"deleted":0}'::jsonb;
begin
  select * into connection from public.client_google_health_connections
   where client_email = lower(btrim(target_email)) and connection_id = target_connection_id
   for update;
  if not found or connection.owner_user_id is null or connection.needs_reconnect
     or connection.sync_lease_id is distinct from target_lease_id or target_lease_id is null
     or connection.sync_lease_expires_at is null or connection.sync_lease_expires_at <= clock_timestamp()
     or not (connection.auto_sync_enabled or connection.sync_lease_manual) then
    return rejected;
  end if;
  -- Lock eligible program rows so an archive racing this transaction has a
  -- definite before/after order. An archived client cannot receive new imports.
  perform 1 from public.client_programs as program
   where lower(btrim(program.client_email)) = connection.client_email
     and program.active is true and program.client_archived is not true for share;
  if not found then return rejected; end if;
  if jsonb_typeof(workouts) is distinct from 'array' or jsonb_array_length(workouts) > 5000 then
    raise exception 'Invalid Google Health workout batch';
  end if;
  if (window_start is null) <> (window_end is null)
     or (window_start is not null and (not isfinite(window_start) or not isfinite(window_end)
       or window_end <= window_start or window_end - window_start > interval '366 days')) then
    raise exception 'Invalid Google Health reconciliation window';
  end if;
  if exists (select 1 from jsonb_array_elements(workouts) as item
    where jsonb_typeof(item) <> 'object' or nullif(btrim(item->>'source_name'), '') is null)
    or exists (select 1 from jsonb_array_elements(workouts) as item group by item->>'source_name' having count(*) > 1) then
    raise exception 'Invalid or duplicate Google Health source identity';
  end if;

  select count(*) filter (where existing.id is null), count(*) filter (where existing.id is not null)
    into imported_count, updated_count
    from jsonb_array_elements(workouts) as item
    left join public.client_google_health_workouts as existing
      on existing.owner_user_id = connection.owner_user_id and existing.source_name = item->>'source_name';

  insert into public.client_google_health_workouts (
    owner_user_id, client_email, source_name, workout_date, activity_type, started_at, ended_at,
    duration_seconds, elapsed_seconds, calories, distance_meters, average_heart_rate
  )
  select connection.owner_user_id, connection.client_email, item.source_name, item.workout_date,
    item.activity_type, item.started_at, item.ended_at, item.duration_seconds, item.elapsed_seconds,
    item.calories, item.distance_meters, item.average_heart_rate
  from jsonb_to_recordset(workouts) as item(
    source_name text, workout_date date, activity_type text, started_at timestamptz, ended_at timestamptz,
    duration_seconds numeric, elapsed_seconds numeric, calories numeric, distance_meters numeric, average_heart_rate numeric
  )
  on conflict (owner_user_id, source_name) do update set
    client_email = excluded.client_email, workout_date = excluded.workout_date,
    activity_type = excluded.activity_type, started_at = excluded.started_at, ended_at = excluded.ended_at,
    duration_seconds = excluded.duration_seconds, elapsed_seconds = excluded.elapsed_seconds,
    calories = excluded.calories, distance_meters = excluded.distance_meters,
    average_heart_rate = excluded.average_heart_rate, updated_at = clock_timestamp();

  -- Only a completely fetched provider interval can authorize reconciliation.
  -- Omitting the window keeps older imported history untouched.
  if window_start is not null then
    delete from public.client_google_health_workouts as existing
     where existing.owner_user_id = connection.owner_user_id
       and existing.started_at >= window_start and existing.started_at < window_end
       and not exists (select 1 from jsonb_array_elements(workouts) as item where item->>'source_name' = existing.source_name);
    get diagnostics deleted_count = row_count;
  end if;
  update public.client_google_health_connections set
    last_synced_at = clock_timestamp(), last_sync_error = null,
    sync_lease_id = null, sync_lease_expires_at = null, sync_lease_manual = false,
    updated_at = clock_timestamp()
   where client_email = connection.client_email and connection_id = target_connection_id;
  return jsonb_build_object('committed', true, 'imported', imported_count, 'updated', updated_count, 'deleted', deleted_count);
end;
$$;

create or replace function public.finish_google_health_connection(
  target_email text, target_owner_user_id uuid, target_state text, token_data jsonb
) returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare pending public.client_google_health_oauth_states%rowtype;
begin
  select * into pending from public.client_google_health_oauth_states
   where state = target_state and client_email = lower(btrim(target_email))
     and owner_user_id = target_owner_user_id and expires_at > clock_timestamp() for update;
  if not found then return false; end if;
  perform 1 from public.client_programs as program
   where lower(btrim(program.client_email)) = pending.client_email
     and program.active is true and program.client_archived is not true for share;
  if not found then return false; end if;
  if jsonb_typeof(token_data) is distinct from 'object'
     or coalesce(char_length(token_data->>'access_token'), 0) not between 1 and 16384
     or coalesce(char_length(token_data->>'refresh_token'), 0) not between 1 and 16384 then
    raise exception 'Invalid Google Health connection tokens';
  end if;
  delete from public.client_google_health_oauth_states where state = target_state;
  insert into public.client_google_health_connections (
    client_email, owner_user_id, connection_id, access_token, refresh_token, scope, token_type, expires_at,
    auto_sync_enabled, needs_reconnect, last_synced_at, last_sync_attempt_at, last_sync_error,
    sync_lease_id, sync_lease_expires_at, sync_lease_manual, updated_at
  ) values (
    pending.client_email, target_owner_user_id, gen_random_uuid(), token_data->>'access_token',
    token_data->>'refresh_token', token_data->>'scope', coalesce(token_data->>'token_type', 'Bearer'),
    (token_data->>'expires_at')::timestamptz, true, false, null, null, null, null, null, false, clock_timestamp()
  ) on conflict (client_email) do update set
    owner_user_id = excluded.owner_user_id, connection_id = excluded.connection_id,
    access_token = excluded.access_token, refresh_token = excluded.refresh_token,
    scope = excluded.scope, token_type = excluded.token_type, expires_at = excluded.expires_at,
    auto_sync_enabled = true, needs_reconnect = false, last_synced_at = null,
    last_sync_attempt_at = null, last_sync_error = null, sync_lease_id = null,
    sync_lease_expires_at = null, sync_lease_manual = false, updated_at = clock_timestamp();
  return true;
end;
$$;

create or replace function public.disconnect_google_health(target_email text, target_owner_user_id uuid)
returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  -- Lock/delete state before the connection, matching callback finalization's
  -- order. A callback already exchanging tokens cannot resurrect a disconnect.
  delete from public.client_google_health_oauth_states
   where client_email = lower(btrim(target_email)) and owner_user_id = target_owner_user_id;
  delete from public.client_google_health_connections
   where client_email = lower(btrim(target_email)) and owner_user_id = target_owner_user_id;
  return true;
end;
$$;

revoke all on function public.claim_google_health_sync(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.commit_google_health_sync(text, uuid, uuid, jsonb, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.finish_google_health_connection(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.disconnect_google_health(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_google_health_sync(text, uuid, boolean) to service_role;
grant execute on function public.commit_google_health_sync(text, uuid, uuid, jsonb, timestamptz, timestamptz) to service_role;
grant execute on function public.finish_google_health_connection(text, uuid, text, jsonb) to service_role;
grant execute on function public.disconnect_google_health(text, uuid) to service_role;

-- Scheduler integration. The raw credential stays in Vault; the function can
-- only read its digest. No browser role can read either configuration surface.
create extension if not exists pg_net;
create extension if not exists pg_cron with schema pg_catalog;
create table public.google_health_sync_config (
  id smallint primary key default 1 check (id = 1),
  secret_hash text not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.google_health_sync_config enable row level security;
revoke all on public.google_health_sync_config from public, anon, authenticated;
grant select on public.google_health_sync_config to service_role;

do $$
declare sync_secret text;
begin
  select decrypted_secret into sync_secret from vault.decrypted_secrets
   where name = 'fwb_google_health_sync_secret' limit 1;
  if sync_secret is null then
    sync_secret := encode(extensions.gen_random_bytes(32), 'hex');
    perform vault.create_secret(sync_secret, 'fwb_google_health_sync_secret');
  end if;
  insert into public.google_health_sync_config (id, secret_hash)
  values (1, encode(extensions.digest(sync_secret, 'sha256'), 'hex'))
  on conflict (id) do update set secret_hash = excluded.secret_hash, updated_at = clock_timestamp();
end;
$$;

select cron.schedule('fwb-google-health-sync', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://qukdfjeupjhpthfbaonv.supabase.co/functions/v1/fitbit-auth?action=sync-all',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-FWB-Health-Sync-Secret', (
      select decrypted_secret from vault.decrypted_secrets where name = 'fwb_google_health_sync_secret' limit 1
    )),
    body := jsonb_build_object('action', 'sync-all'), timeout_milliseconds := 120000
  );
$cron$);

notify pgrst, 'reload schema';
