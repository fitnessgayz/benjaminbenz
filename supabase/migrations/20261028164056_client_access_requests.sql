create table public.client_access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (char_length(email) between 3 and 180),
  phone text not null default '' check (char_length(phone) <= 60),
  goals text not null default '' check (char_length(goals) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);

create unique index client_access_requests_one_pending_email
  on public.client_access_requests (lower(email)) where status = 'pending';

create index client_access_requests_pending_created_at
  on public.client_access_requests (created_at desc) where status = 'pending';

alter table public.client_access_requests enable row level security;
revoke all on public.client_access_requests from anon, authenticated;
grant select on public.client_access_requests to authenticated;
grant update (status, decided_at, decided_by) on public.client_access_requests to authenticated;

create policy "Coach reads client access requests"
  on public.client_access_requests for select to authenticated
  using ((select public.is_coach_admin()));

create policy "Coach decides client access requests"
  on public.client_access_requests for update to authenticated
  using ((select public.is_coach_admin()))
  with check ((select public.is_coach_admin()));
