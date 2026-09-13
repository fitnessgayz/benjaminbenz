alter table public.client_progress
  add column if not exists lean_mass numeric;

alter table public.client_progress
  drop constraint if exists client_progress_lean_mass_range;

alter table public.client_progress
  add constraint client_progress_lean_mass_range
  check (lean_mass is null or (lean_mass >= 0 and lean_mass <= 1500));

comment on column public.client_progress.lean_mass is
  'Whole-body lean mass reported by a DEXA scan. This is intentionally separate from muscle_mass.';

create table if not exists public.client_dexa_reports (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_email text not null
    check (
      client_email = lower(btrim(client_email))
      and char_length(client_email) between 3 and 320
      and position('@' in client_email) > 1
    ),
  storage_path text not null unique
    check (char_length(storage_path) between 38 and 500),
  original_filename text not null
    check (char_length(btrim(original_filename)) between 1 and 255),
  mime_type text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size_bytes bigint not null
    check (file_size_bytes between 1 and 10485760),
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed', 'confirmed')),
  extraction_attempts smallint not null default 0
    check (extraction_attempts between 0 and 3),
  extracted_scan_date date,
  extracted_bodyweight_lb numeric
    check (extracted_bodyweight_lb is null or (extracted_bodyweight_lb >= 0 and extracted_bodyweight_lb <= 1500)),
  extracted_bodyfat_percent numeric
    check (extracted_bodyfat_percent is null or (extracted_bodyfat_percent >= 0 and extracted_bodyfat_percent <= 100)),
  extracted_lean_mass_lb numeric
    check (extracted_lean_mass_lb is null or (extracted_lean_mass_lb >= 0 and extracted_lean_mass_lb <= 1500)),
  extraction_confidence text
    check (extraction_confidence is null or extraction_confidence in ('high', 'medium', 'low')),
  extraction_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(extraction_data) = 'object'),
  extraction_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(extraction_warnings) = 'array'),
  extraction_error text not null default ''
    check (char_length(extraction_error) <= 500),
  progress_entry_id uuid references public.client_progress(id) on delete set null,
  processed_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.client_dexa_reports is
  'Private DEXA source reports and reviewed extraction metadata. Clients can read their own rows; server functions own all writes.';

comment on column public.client_dexa_reports.extraction_data is
  'Sanitized structured DEXA fields only. Raw OCR text and model responses must never be stored here.';

create index if not exists client_dexa_reports_owner_created_idx
  on public.client_dexa_reports (owner_user_id, created_at desc);

create index if not exists client_dexa_reports_client_date_idx
  on public.client_dexa_reports (client_email, extracted_scan_date desc, created_at desc);

alter table public.client_dexa_reports enable row level security;

revoke all on public.client_dexa_reports from public, anon, authenticated;
grant select on public.client_dexa_reports to authenticated;

drop policy if exists "Clients can read their own DEXA reports" on public.client_dexa_reports;
create policy "Clients can read their own DEXA reports"
on public.client_dexa_reports
for select
to authenticated
using ((select auth.uid()) = owner_user_id);

drop policy if exists "Coach admins can read client DEXA reports" on public.client_dexa_reports;
create policy "Coach admins can read client DEXA reports"
on public.client_dexa_reports
for select
to authenticated
using ((select public.is_coach_admin()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dexa-reports',
  'dexa-reports',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Clients can upload their private DEXA reports" on storage.objects;
create policy "Clients can upload their private DEXA reports"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'dexa-reports'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Clients and coach can read private DEXA reports" on storage.objects;
create policy "Clients and coach can read private DEXA reports"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'dexa-reports'
  and (
    owner_id = (select auth.uid())::text
    or (select public.is_coach_admin())
  )
);

drop policy if exists "Clients and coach can delete private DEXA reports" on storage.objects;
create policy "Clients and coach can delete private DEXA reports"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'dexa-reports'
  and (
    owner_id = (select auth.uid())::text
    or (select public.is_coach_admin())
  )
);
