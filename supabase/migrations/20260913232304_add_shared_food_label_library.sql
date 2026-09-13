create table if not exists public.shared_food_library (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique
    check (fingerprint ~ '^[a-f0-9]{64}$'),
  food_name text not null
    check (char_length(btrim(food_name)) between 1 and 160),
  brand text not null default ''
    check (char_length(brand) <= 120),
  serving text not null
    check (char_length(btrim(serving)) between 1 and 120),
  calories numeric not null
    check (calories between 0 and 10000),
  protein numeric not null
    check (protein between 0 and 1000),
  carbs numeric not null
    check (carbs between 0 and 1000),
  fat numeric not null
    check (fat between 0 and 1000),
  source text not null default 'food_label'
    check (source = 'food_label'),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.shared_food_library is
  'Reviewed nutrition-label foods shared read-only with every authenticated client. Source photos are processed transiently and are not stored.';

create index if not exists shared_food_library_name_idx
  on public.shared_food_library (lower(food_name));

create index if not exists shared_food_library_created_idx
  on public.shared_food_library (created_at desc);

create index if not exists shared_food_library_creator_idx
  on public.shared_food_library (created_by_user_id);

alter table public.shared_food_library enable row level security;

revoke all on public.shared_food_library from public, anon, authenticated;
grant select on public.shared_food_library to authenticated;

drop policy if exists "Authenticated clients can read the shared food library" on public.shared_food_library;
create policy "Authenticated clients can read the shared food library"
on public.shared_food_library
for select
to authenticated
using (true);
