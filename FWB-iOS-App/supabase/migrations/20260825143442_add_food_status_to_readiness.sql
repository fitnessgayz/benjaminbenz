alter table public.client_check_ins
  add column if not exists has_eaten_today boolean;

comment on column public.client_check_ins.sleep_recovery is
  'Client-reported sleep quality from 1 (poor) through 5 (great).';
comment on column public.client_check_ins.has_eaten_today is
  'Whether the client reported having eaten at the time of the daily readiness check-in.';
