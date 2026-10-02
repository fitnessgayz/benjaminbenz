-- One plan per client and calendar quarter. Badges are derived from saved activity,
-- never accepted as client-written award flags.
create table public.client_quarterly_goals (
  client_id uuid not null references auth.users(id) on delete cascade,
  quarter_start date not null check (extract(day from quarter_start)=1 and extract(month from quarter_start) in (1,4,7,10)),
  workouts_week integer not null check (workouts_week between 1 and 21),
  workouts_month integer not null check (workouts_month between 1 and 93),
  workouts_quarter integer not null check (workouts_quarter between 1 and 279),
  visits_week integer not null check (visits_week between 1 and 7),
  visits_month integer not null check (visits_month between 1 and 31),
  visits_quarter integer not null check (visits_quarter between 1 and 92),
  weight_target numeric check (weight_target > 0 and weight_target <= 1500),
  weight_direction text not null default 'at_or_below' check (weight_direction in ('at_or_below','at_or_above')),
  bodyfat_target numeric check (bodyfat_target > 0 and bodyfat_target < 100),
  motivation text not null default '' check (length(motivation)<=1000),
  primary key (client_id,quarter_start)
);
alter table public.client_quarterly_goals enable row level security;
revoke all on public.client_quarterly_goals from public, anon, authenticated;
grant select, insert, update on public.client_quarterly_goals to authenticated;
create policy "Clients read their quarter goals" on public.client_quarterly_goals for select to authenticated using (client_id=(select auth.uid()));
create policy "Clients create their quarter goals" on public.client_quarterly_goals for insert to authenticated with check (client_id=(select auth.uid()));
create policy "Clients update their quarter goals" on public.client_quarterly_goals for update to authenticated using (client_id=(select auth.uid())) with check (client_id=(select auth.uid()));
create policy "Coaches read quarter goals" on public.client_quarterly_goals for select to authenticated using ((select public.is_coach_admin()));
