-- Cross-platform continuity contract for FWB Training.
-- Versioned only: do not apply automatically from an iOS build or release job.

create or replace function public.fwb_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table if exists public.client_workout_logs
  add column if not exists session_id uuid,
  add column if not exists set_id uuid,
  add column if not exists workout_template_id uuid,
  add column if not exists source text not null default 'legacy',
  add column if not exists source_version integer not null default 0,
  add column if not exists client_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;

update public.client_workout_logs
set session_id = md5(
  lower(trim(client_email)) || '|' || entry_date::text || '|' || lower(trim(workout_title))
)::uuid
where session_id is null;

update public.client_workout_logs
set set_id = md5(
  session_id::text || '|' || lower(trim(exercise_code)) || '|' || set_number::text
)::uuid
where set_id is null;

alter table if exists public.client_workout_logs
  alter column session_id set not null,
  alter column set_id set not null;

create unique index if not exists client_workout_logs_session_set_uidx
  on public.client_workout_logs (session_id, set_id);
create index if not exists client_workout_logs_client_session_idx
  on public.client_workout_logs (lower(client_email), session_id, updated_at desc);

drop trigger if exists fwb_touch_client_workout_logs on public.client_workout_logs;
create trigger fwb_touch_client_workout_logs
before update on public.client_workout_logs
for each row execute function public.fwb_touch_updated_at();

create table if not exists public.client_workout_drafts (
  session_id uuid primary key,
  client_email text not null,
  workout_key text not null,
  workout_template_id uuid,
  entry_date date not null,
  workout_title text not null,
  snapshot jsonb not null,
  source text not null default 'ios_app',
  source_version integer not null default 1,
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint client_workout_drafts_client_key_unique unique (client_email, workout_key),
  constraint client_workout_drafts_snapshot_object check (jsonb_typeof(snapshot) = 'object')
);

alter table public.client_workout_drafts enable row level security;
alter table public.client_workout_drafts force row level security;

revoke all on table public.client_workout_drafts from anon, authenticated;
grant select, insert, update, delete on table public.client_workout_drafts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'client_workout_drafts'
      and policyname = 'Clients manage own workout drafts'
  ) then
    create policy "Clients manage own workout drafts"
      on public.client_workout_drafts
      for all
      using (lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')))
      with check (lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));
  end if;
end
$$;

drop trigger if exists fwb_touch_client_workout_drafts on public.client_workout_drafts;
create trigger fwb_touch_client_workout_drafts
before update on public.client_workout_drafts
for each row execute function public.fwb_touch_updated_at();

alter table if exists public.client_programs
  add column if not exists sync_source text not null default 'legacy',
  add column if not exists source_version integer not null default 0,
  add column if not exists client_updated_at timestamptz;

alter table if exists public.client_progress
  add column if not exists client_mutation_id uuid,
  add column if not exists source text not null default 'legacy',
  add column if not exists source_version integer not null default 0,
  add column if not exists client_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists client_progress_mutation_uidx
  on public.client_progress (client_mutation_id)
  where client_mutation_id is not null;

drop trigger if exists fwb_touch_client_progress on public.client_progress;
create trigger fwb_touch_client_progress
before update on public.client_progress
for each row execute function public.fwb_touch_updated_at();

alter table if exists public.client_check_ins
  add column if not exists client_mutation_id uuid,
  add column if not exists source_version integer not null default 0;

create unique index if not exists client_check_ins_mutation_uidx
  on public.client_check_ins (client_mutation_id)
  where client_mutation_id is not null;

alter table if exists public.client_progress_photos
  add column if not exists client_mutation_id uuid,
  add column if not exists source text not null default 'legacy',
  add column if not exists source_version integer not null default 0,
  add column if not exists client_updated_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists client_progress_photos_mutation_uidx
  on public.client_progress_photos (client_mutation_id)
  where client_mutation_id is not null;

drop trigger if exists fwb_touch_client_progress_photos on public.client_progress_photos;
create trigger fwb_touch_client_progress_photos
before update on public.client_progress_photos
for each row execute function public.fwb_touch_updated_at();

comment on table public.client_workout_drafts is
  'Incomplete, resumable workout state only. Completed workout facts stay in client_workout_logs.';
comment on column public.client_workout_logs.client_updated_at is
  'Device event time used for conflict comparison; updated_at remains server-maintained.';
