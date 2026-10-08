-- Accept mobile web weekly check-ins under the same client ownership rules as
-- native check-ins, without changing the native or coach policies.
create policy "Web clients can create their check-ins"
  on public.client_check_ins for insert to authenticated
  with check (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
    and source = 'client_portal'
    and coach_response is null
    and coach_responded_at is null
  );

create policy "Web clients can update their check-ins"
  on public.client_check_ins for update to authenticated
  using (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
    and source = 'client_portal'
    and coach_response is null
    and coach_responded_at is null
  )
  with check (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
    and source = 'client_portal'
    and coach_response is null
    and coach_responded_at is null
  );
