-- Client-controlled sharing choices. No cross-client access is granted yet.
create table public.client_community_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  badges_opt_in boolean not null default false,
  progress_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.client_community_preferences enable row level security;
revoke all on public.client_community_preferences from anon, authenticated;
grant select, insert, update on public.client_community_preferences to authenticated;

create policy "Clients read their community choices"
  on public.client_community_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Clients create their community choices"
  on public.client_community_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Clients update their community choices"
  on public.client_community_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
