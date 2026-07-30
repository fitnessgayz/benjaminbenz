create table if not exists public.client_food_logs (
  id uuid primary key default gen_random_uuid(),
  client_email text not null,
  entry_date date not null default current_date,
  meal text not null default 'Meal',
  food_name text not null,
  serving text,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  source text,
  fdc_id text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_food_logs_client_date_idx
on public.client_food_logs (lower(client_email), entry_date desc);

alter table public.client_food_logs enable row level security;

drop policy if exists "Clients can view their food logs" on public.client_food_logs;
create policy "Clients can view their food logs"
on public.client_food_logs
for select
to authenticated
using (lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "Clients can add their food logs" on public.client_food_logs;
create policy "Clients can add their food logs"
on public.client_food_logs
for insert
to authenticated
with check (lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "Clients can update their food logs" on public.client_food_logs;
create policy "Clients can update their food logs"
on public.client_food_logs
for update
to authenticated
using (lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
with check (lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "Clients can delete their food logs" on public.client_food_logs;
create policy "Clients can delete their food logs"
on public.client_food_logs
for delete
to authenticated
using (lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "Coach can view food logs" on public.client_food_logs;
create policy "Coach can view food logs"
on public.client_food_logs
for select
to authenticated
using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'benjaminbenz.fit@gmail.com');

grant select, insert, update, delete on public.client_food_logs to authenticated;
