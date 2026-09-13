create index if not exists client_dexa_reports_progress_entry_idx
  on public.client_dexa_reports (progress_entry_id)
  where progress_entry_id is not null;

drop policy if exists "Clients can read their own DEXA reports" on public.client_dexa_reports;
drop policy if exists "Coach admins can read client DEXA reports" on public.client_dexa_reports;
drop policy if exists "Authenticated users can read permitted DEXA reports" on public.client_dexa_reports;

create policy "Authenticated users can read permitted DEXA reports"
on public.client_dexa_reports
for select
to authenticated
using (
  (select auth.uid()) = owner_user_id
  or (select public.is_coach_admin())
);
