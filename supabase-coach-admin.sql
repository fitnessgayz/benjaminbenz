create or replace function public.is_coach_admin()
returns boolean
language sql
stable
as $$
  select lower(auth.jwt() ->> 'email') = lower('benjaminbenz.fit@gmail.com');
$$;

drop policy if exists "Coach admins can read all programs" on public.client_programs;
create policy "Coach admins can read all programs"
on public.client_programs
for select
to authenticated
using (public.is_coach_admin());

drop policy if exists "Coach admins can create programs" on public.client_programs;
create policy "Coach admins can create programs"
on public.client_programs
for insert
to authenticated
with check (public.is_coach_admin());

drop policy if exists "Coach admins can update programs" on public.client_programs;
create policy "Coach admins can update programs"
on public.client_programs
for update
to authenticated
using (public.is_coach_admin())
with check (public.is_coach_admin());

drop policy if exists "Coach admins can delete archived programs" on public.client_programs;
create policy "Coach admins can delete archived programs"
on public.client_programs
for delete
to authenticated
using (public.is_coach_admin() and active = false);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_client_programs_updated_at on public.client_programs;
create trigger set_client_programs_updated_at
before update on public.client_programs
for each row
execute function public.set_updated_at();
