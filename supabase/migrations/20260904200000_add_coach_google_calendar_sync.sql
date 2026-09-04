create table if not exists public.coach_google_calendar_connections (
  coach_email text primary key,
  calendar_id text not null,
  access_token text not null,
  refresh_token text not null,
  scope text,
  token_type text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_google_calendar_oauth_states (
  state text primary key,
  coach_email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists coach_google_calendar_oauth_states_expiry_idx
on public.coach_google_calendar_oauth_states (expires_at);

alter table public.coach_google_calendar_connections enable row level security;
alter table public.coach_google_calendar_oauth_states enable row level security;

revoke all on public.coach_google_calendar_connections from anon, authenticated;
revoke all on public.coach_google_calendar_oauth_states from anon, authenticated;

notify pgrst, 'reload schema';
