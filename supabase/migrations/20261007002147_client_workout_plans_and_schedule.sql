-- Extend the existing saved-plan table for iOS sync. Its original plan JSON
-- remains populated for any reader of the pre-existing schema.
alter table public.client_saved_workout_plans
  add column snapshot_json text,
  add column is_deleted boolean not null default false,
  add column updated_at timestamptz not null default now(),
  add constraint client_saved_workout_plans_snapshot_size
    check (snapshot_json is null or octet_length(snapshot_json) between 2 and 262144);

create function public.sync_client_saved_workout_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.snapshot_json is not null then
    new.plan = new.snapshot_json::jsonb;
  end if;
  new.updated_at = now();
  return new;
end;
$$;
create trigger client_saved_workout_plans_sync_snapshot
  before insert or update on public.client_saved_workout_plans
  for each row execute function public.sync_client_saved_workout_plan();

create index client_saved_workout_plans_owner_active_idx
  on public.client_saved_workout_plans (user_id) where not is_deleted;
grant update on public.client_saved_workout_plans to authenticated;
create policy "Clients update their saved workout plans" on public.client_saved_workout_plans
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- A scheduled session is a plan snapshot, distinct from a gym visit or log.
-- Tombstones keep an old device from resurrecting a removed calendar entry.
create table public.client_workout_schedule (
  id uuid primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null check (client_email = lower(btrim(client_email)) and client_email <> ''),
  planned_date date not null,
  source_type text not null check (source_type in ('assigned', 'generated')),
  title text not null check (length(title) between 1 and 300),
  snapshot_json text not null check (octet_length(snapshot_json) between 2 and 262144),
  is_deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index client_workout_schedule_client_date_idx
  on public.client_workout_schedule (client_email, planned_date) where not is_deleted;

create function public.touch_client_workout_schedule_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger client_workout_schedule_updated_at
  before update on public.client_workout_schedule
  for each row execute function public.touch_client_workout_schedule_updated_at();

alter table public.client_workout_schedule enable row level security;
revoke all on public.client_workout_schedule from public, anon, authenticated;
grant select, insert, update on public.client_workout_schedule to authenticated;
create policy "Clients and coaches read schedules" on public.client_workout_schedule
  for select to authenticated using (
    owner_user_id = (select auth.uid()) or (select public.is_coach_admin())
  );
create policy "Clients create their schedules" on public.client_workout_schedule
  for insert to authenticated with check (
    owner_user_id = (select auth.uid())
    and client_email = lower(coalesce((select auth.jwt())->>'email', ''))
  );
create policy "Clients update their schedules" on public.client_workout_schedule
  for update to authenticated using (owner_user_id = (select auth.uid()))
  with check (
    owner_user_id = (select auth.uid())
    and client_email = lower(coalesce((select auth.jwt())->>'email', ''))
  );
