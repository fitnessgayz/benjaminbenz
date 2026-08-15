-- Adds grouped workout logging for ChatGPT and Claude while preserving the
-- existing client portal workout history.

alter table public.client_workout_logs
add column if not exists workout_session_id uuid;

alter table public.client_workout_logs
add column if not exists source text not null default 'website';

alter table public.client_workout_logs
add column if not exists exercise_code text not null default '';

-- Bodyweight and resistance-unspecified sets are represented with a null
-- weight instead of a misleading 0 lb value.
alter table public.client_workout_logs
alter column weight_used drop not null;

create index if not exists client_workout_logs_client_session_idx
on public.client_workout_logs (lower(client_email), workout_session_id)
where workout_session_id is not null;

alter table public.client_workout_logs enable row level security;

grant select, insert, update, delete
on public.client_workout_logs
to authenticated;

drop policy if exists "Clients can delete their own workout logs"
on public.client_workout_logs;

create policy "Clients can delete their own workout logs"
on public.client_workout_logs
for delete
to authenticated
using (
  lower(client_email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);
