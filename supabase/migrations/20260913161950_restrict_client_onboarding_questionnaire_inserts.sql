-- Historical compatibility migration. The following Edge-only cleanup
-- supersedes this narrow account-onboarding insert path.
drop policy if exists "Clients can submit their onboarding questionnaire"
on public.client_fitness_questionnaires;

revoke insert on table public.client_fitness_questionnaires from authenticated;

grant insert (
  source,
  source_submission_id,
  submitted_at,
  respondent_name,
  respondent_email,
  linked_user_id,
  linked_client_email,
  match_status,
  answers,
  profile_imported_at
) on public.client_fitness_questionnaires to authenticated;

create policy "Clients can submit their onboarding questionnaire"
on public.client_fitness_questionnaires
for insert
to authenticated
with check (
  source = 'client_portal'
  and source_submission_id = 'invite-' || (select auth.uid())::text
  and linked_user_id = (select auth.uid())
  and linked_client_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and lower(btrim(respondent_email)) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  and match_status = 'matched'
  and jsonb_typeof(answers) = 'object'
  and octet_length(answers::text) <= 30000
);
