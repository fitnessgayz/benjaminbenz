alter table public.client_programs
add column if not exists nutrition_plan jsonb not null default '{}'::jsonb;
