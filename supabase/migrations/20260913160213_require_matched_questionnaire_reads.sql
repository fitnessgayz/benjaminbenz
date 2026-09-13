-- A questionnaire is client-visible only after the historical/import review has
-- positively marked it as matched. Coaches retain access for reconciliation.
drop policy if exists "Clients and coach can read fitness questionnaires"
on public.client_fitness_questionnaires;

create policy "Clients and coach can read fitness questionnaires"
on public.client_fitness_questionnaires
for select
to authenticated
using (
  (
    match_status = 'matched'
    and linked_user_id = (select auth.uid())
  )
  or (select public.is_coach_admin())
);
