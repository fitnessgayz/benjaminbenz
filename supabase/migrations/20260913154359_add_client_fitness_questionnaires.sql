-- Private client-facing copies of submitted fitness questionnaires.
-- Source documents and shared response-sheet identifiers intentionally stay out
-- of this exposed table so one client can never discover another client's data.
create table public.client_fitness_questionnaires (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('google_sheet', 'client_portal')),
  source_submission_id text not null check (
    char_length(btrim(source_submission_id)) between 1 and 200
  ),
  submitted_at timestamptz not null,
  respondent_name text not null check (
    char_length(btrim(respondent_name)) between 1 and 200
  ),
  respondent_email text not null check (
    char_length(btrim(respondent_email)) between 3 and 320
    and position('@' in respondent_email) > 1
  ),
  linked_user_id uuid references auth.users(id) on delete set null,
  linked_client_email text check (
    linked_client_email is null
    or (
      char_length(linked_client_email) between 3 and 320
      and linked_client_email = lower(btrim(linked_client_email))
      and position('@' in linked_client_email) > 1
    )
  ),
  match_status text not null default 'review' check (
    match_status in ('matched', 'review', 'unmatched')
  ),
  answers jsonb not null default '{}'::jsonb check (
    jsonb_typeof(answers) = 'object'
  ),
  source_imported_at timestamptz not null default now(),
  profile_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_fitness_questionnaires_matched_owner_check check (
    match_status <> 'matched'
    or (linked_user_id is not null and linked_client_email is not null)
  ),
  constraint client_fitness_questionnaires_source_submission_unique
    unique (source, source_submission_id)
);

comment on table public.client_fitness_questionnaires is
  'Private, client-scoped copies of fitness questionnaire submissions.';
comment on column public.client_fitness_questionnaires.linked_user_id is
  'Verified auth user used for client authorization; submitted email is never an authorization key.';
comment on column public.client_fitness_questionnaires.linked_client_email is
  'Normalized client-program email retained for server-side matching and coach lookup.';

create index client_fitness_questionnaires_user_submitted_idx
  on public.client_fitness_questionnaires (linked_user_id, submitted_at desc)
  where linked_user_id is not null;

create index client_fitness_questionnaires_client_email_submitted_idx
  on public.client_fitness_questionnaires (lower(linked_client_email), submitted_at desc)
  where linked_client_email is not null;

create index client_fitness_questionnaires_match_status_idx
  on public.client_fitness_questionnaires (match_status, submitted_at desc);

create trigger set_client_fitness_questionnaires_updated_at
before update on public.client_fitness_questionnaires
for each row execute function public.set_updated_at();

alter table public.client_fitness_questionnaires enable row level security;

revoke all on table public.client_fitness_questionnaires from public, anon, authenticated;
grant select on table public.client_fitness_questionnaires to authenticated;

create policy "Clients and coach can read fitness questionnaires"
on public.client_fitness_questionnaires
for select
to authenticated
using (
  linked_user_id = (select auth.uid())
  or (select public.is_coach_admin())
);
