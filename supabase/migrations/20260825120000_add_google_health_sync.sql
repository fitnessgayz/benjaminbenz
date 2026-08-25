create table if not exists public.client_google_health_connections (
  client_email text primary key,
  access_token text not null,
  refresh_token text not null,
  scope text,
  token_type text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_google_health_activity_syncs (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  entry_date date not null,
  workout_title text not null,
  google_health_data_point_name text,
  synced_at timestamptz not null default now(),
  unique (client_email, entry_date, workout_title)
);

create table if not exists public.client_google_health_oauth_states (
  state text primary key,
  client_email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists client_google_health_activity_syncs_client_date_idx
on public.client_google_health_activity_syncs (lower(client_email), entry_date desc);

create index if not exists client_google_health_oauth_states_expiry_idx
on public.client_google_health_oauth_states (expires_at);

alter table public.client_google_health_connections enable row level security;
alter table public.client_google_health_activity_syncs enable row level security;
alter table public.client_google_health_oauth_states enable row level security;

revoke all on public.client_google_health_connections from anon, authenticated;
revoke all on public.client_google_health_activity_syncs from anon, authenticated;
revoke all on public.client_google_health_oauth_states from anon, authenticated;

notify pgrst, 'reload schema';
