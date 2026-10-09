-- Clients can optionally record the gym they visited at check-in.
-- Existing check-ins remain valid, and the table keeps its insert-only policy.
alter table public.client_gym_checkins
  add column gym_name text
  constraint client_gym_checkins_gym_name_length
    check (gym_name is null or (gym_name = btrim(gym_name) and length(gym_name) between 1 and 120));
