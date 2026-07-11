revoke update on public.client_programs from authenticated;
grant update (height, starting_weight, starting_bodyfat) on public.client_programs to authenticated;

drop policy if exists "Clients can update their own metrics" on public.client_programs;
create policy "Clients can update their own metrics"
on public.client_programs
for update
to authenticated
using (
  lower(auth.jwt() ->> 'email') = lower(client_email)
  and active = true
  and client_archived = false
)
with check (
  lower(auth.jwt() ->> 'email') = lower(client_email)
  and active = true
  and client_archived = false
);
