-- A short-lived cache may contain only Geoapify gyms when the supplemental
-- public hotel-gym map query is busy. Preserve that status for clients.
alter table public.gym_search_cache
  add column partial boolean not null default false;
