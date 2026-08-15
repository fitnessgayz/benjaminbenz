create table if not exists public.client_fitbit_connections (
  client_email text primary key,
  fitbit_user_id text,
  access_token text not null,
  refresh_token text not null,
  scope text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_fitbit_activity_syncs (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  entry_date date not null,
  workout_title text not null,
  fitbit_log_id text,
  synced_at timestamptz not null default now(),
  unique (client_email, entry_date, workout_title)
);

create index if not exists client_fitbit_activity_syncs_client_date_idx
on public.client_fitbit_activity_syncs (lower(client_email), entry_date desc);

alter table public.client_fitbit_connections enable row level security;
alter table public.client_fitbit_activity_syncs enable row level security;

revoke all on public.client_fitbit_connections from anon, authenticated;
revoke all on public.client_fitbit_activity_syncs from anon, authenticated;

notify pgrst, 'reload schema';
