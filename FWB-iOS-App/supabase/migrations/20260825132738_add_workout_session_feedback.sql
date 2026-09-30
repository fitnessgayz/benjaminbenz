create table public.workout_session_feedback (
  session_id uuid primary key,
  client_email text not null,
  workout_template_id uuid,
  entry_date date not null,
  workout_title text not null,
  difficulty_rating smallint not null,
  source text not null default 'ios_app',
  source_version integer not null default 1,
  client_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_session_feedback_email_length
    check (char_length(btrim(client_email)) between 3 and 320),
  constraint workout_session_feedback_title_length
    check (char_length(btrim(workout_title)) between 1 and 240),
  constraint workout_session_feedback_difficulty_range
    check (difficulty_rating between 1 and 5),
  constraint workout_session_feedback_source_check
    check (source in ('ios_app', 'website'))
);

create index workout_session_feedback_client_date_idx
  on public.workout_session_feedback (lower(client_email), entry_date desc);

alter table public.workout_session_feedback enable row level security;
alter table public.workout_session_feedback force row level security;

revoke all on table public.workout_session_feedback from anon, authenticated;
grant select, insert, update on table public.workout_session_feedback to authenticated;

create policy "Clients can read their own workout feedback"
  on public.workout_session_feedback
  for select
  to authenticated
  using (lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

create policy "Clients can create their own workout feedback"
  on public.workout_session_feedback
  for insert
  to authenticated
  with check (lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

create policy "Clients can update their own workout feedback"
  on public.workout_session_feedback
  for update
  to authenticated
  using (lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')))
  with check (lower(client_email) = lower(coalesce((select auth.jwt()) ->> 'email', '')));

create policy "Coach admins can read all workout feedback"
  on public.workout_session_feedback
  for select
  to authenticated
  using ((select public.is_coach_admin()));

create trigger fwb_touch_workout_session_feedback
before update on public.workout_session_feedback
for each row execute function public.fwb_touch_updated_at();

comment on table public.workout_session_feedback is
  'One client difficulty rating per completed workout session, shared by the iOS and web apps.';
comment on column public.workout_session_feedback.difficulty_rating is
  'Client-reported workout difficulty from 1 (very easy) through 5 (very hard).';
