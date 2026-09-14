alter table public.client_dexa_reports
  add column if not exists archived_at timestamptz;

comment on column public.client_dexa_reports.archived_at is
  'When set, hides the private report from the active client report list without deleting the source file or extracted measurements.';
