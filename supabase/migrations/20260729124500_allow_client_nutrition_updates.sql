revoke update on public.client_programs from authenticated;
grant update (height, starting_weight, starting_bodyfat, nutrition_plan) on public.client_programs to authenticated;

drop policy if exists "Clients can update their nutrition plan" on public.client_programs;
drop policy if exists "Clients can update their own profile fields" on public.client_programs;
create policy "Clients can update their own profile fields"
on public.client_programs
for update
to authenticated
using (
  active is true
  and coalesce(client_archived, false) is false
  and lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  active is true
  and coalesce(client_archived, false) is false
  and lower(client_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

notify pgrst, 'reload schema';
