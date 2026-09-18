-- Gym attendance is separate from mood/progress check-ins and workout sets.
create table public.client_gym_checkins (
  client_email text not null check (client_email = lower(trim(client_email)) and client_email <> ''),
  entry_date date not null,
  created_at timestamptz not null default now(),
  primary key (client_email, entry_date)
);
alter table public.client_gym_checkins enable row level security;
revoke all on public.client_gym_checkins from anon, authenticated;
grant select, insert on public.client_gym_checkins to authenticated;
create policy "Clients read their gym check-ins" on public.client_gym_checkins
  for select to authenticated using (client_email = lower(coalesce((select auth.jwt())->>'email', '')));
create policy "Clients record their gym check-ins" on public.client_gym_checkins
  for insert to authenticated with check (client_email = lower(coalesce((select auth.jwt())->>'email', '')));
create policy "Coaches read gym check-ins" on public.client_gym_checkins
  for select to authenticated using (public.is_coach_admin());
