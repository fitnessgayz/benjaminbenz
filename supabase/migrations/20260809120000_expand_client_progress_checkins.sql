alter table public.client_progress
  add column if not exists muscle_mass numeric,
  add column if not exists measurements jsonb not null default '{}'::jsonb;

drop policy if exists "Clients can create their own progress" on public.client_progress;
create policy "Clients can create their own progress"
on public.client_progress
for insert
to authenticated
with check (lower((select auth.jwt() ->> 'email')) = lower(client_email));

drop policy if exists "Clients can update their own progress" on public.client_progress;
create policy "Clients can update their own progress"
on public.client_progress
for update
to authenticated
using (lower((select auth.jwt() ->> 'email')) = lower(client_email))
with check (lower((select auth.jwt() ->> 'email')) = lower(client_email));
