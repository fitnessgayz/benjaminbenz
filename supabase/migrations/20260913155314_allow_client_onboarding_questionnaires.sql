create table if not exists public.client_fitness_questionnaires (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('google_sheet', 'client_portal')),
  source_submission_id text not null check (char_length(btrim(source_submission_id)) between 1 and 200),
  submitted_at timestamptz not null,
  respondent_name text not null check (char_length(btrim(respondent_name)) between 1 and 200),
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
  match_status text not null default 'review' check (match_status in ('matched', 'review', 'unmatched')),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  source_imported_at timestamptz not null default now(),
  profile_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_submission_id),
  check (match_status <> 'matched' or (linked_user_id is not null and linked_client_email is not null))
);

create index if not exists client_fitness_questionnaires_user_submitted_idx
on public.client_fitness_questionnaires (linked_user_id, submitted_at desc)
where linked_user_id is not null;

create index if not exists client_fitness_questionnaires_client_email_submitted_idx
on public.client_fitness_questionnaires (lower(linked_client_email), submitted_at desc)
where linked_client_email is not null;

alter table public.client_fitness_questionnaires enable row level security;

grant select, insert on public.client_fitness_questionnaires to authenticated;

drop policy if exists "Clients and coach can read fitness questionnaires" on public.client_fitness_questionnaires;
create policy "Clients and coach can read fitness questionnaires"
on public.client_fitness_questionnaires
for select
to authenticated
using (
  linked_user_id = (select auth.uid())
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can submit their onboarding questionnaire" on public.client_fitness_questionnaires;
create policy "Clients can submit their onboarding questionnaire"
on public.client_fitness_questionnaires
for insert
to authenticated
with check (
  source = 'client_portal'
  and linked_user_id = (select auth.uid())
  and linked_client_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and lower(btrim(respondent_email)) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and match_status = 'matched'
  and jsonb_typeof(answers) = 'object'
);

grant update (fitness_goal) on public.client_programs to authenticated;

notify pgrst, 'reload schema';
