-- The legacy coach admin remains an owner role. Training coaches receive only
-- the roster and workout histories assigned to their authenticated account.
create table public.training_coaches (
  coach_user_id uuid primary key references auth.users(id) on delete cascade,
  is_active boolean not null default true
);

create table public.training_coach_client_assignments (
  client_email text primary key check (client_email <> '' and client_email = lower(btrim(client_email))),
  coach_user_id uuid not null references public.training_coaches(coach_user_id) on delete cascade,
  assigned_at timestamptz not null default now()
);

create index training_coach_client_assignments_coach_idx
  on public.training_coach_client_assignments (coach_user_id);

alter table public.training_coaches enable row level security;
alter table public.training_coach_client_assignments enable row level security;

revoke all on public.training_coaches, public.training_coach_client_assignments
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.training_coaches, public.training_coach_client_assignments
  to authenticated, service_role;

create policy "Training coaches read their own registration"
  on public.training_coaches for select to authenticated
  using (coach_user_id = (select auth.uid()) and (select auth.jwt() ->> 'client_id') is null);

create policy "Coach admin manages training coach registrations"
  on public.training_coaches for all to authenticated
  using ((select public.is_coach_admin()) and (select auth.jwt() ->> 'client_id') is null)
  with check ((select public.is_coach_admin()) and (select auth.jwt() ->> 'client_id') is null);

create function public.is_training_coach()
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select auth.jwt() ->> 'client_id') is null and exists (
    select 1 from public.training_coaches as coach
    where coach.coach_user_id = (select auth.uid()) and coach.is_active
  );
$$;

create policy "Training coaches read their own client assignments"
  on public.training_coach_client_assignments for select to authenticated
  using (coach_user_id = (select auth.uid()) and (select public.is_training_coach()));

create policy "Coach admin manages training coach client assignments"
  on public.training_coach_client_assignments for all to authenticated
  using ((select public.is_coach_admin()) and (select auth.jwt() ->> 'client_id') is null)
  with check ((select public.is_coach_admin()) and (select auth.jwt() ->> 'client_id') is null);

create function public.training_coach_can_access_client(target_client_email text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select (select public.is_training_coach()) and exists (
    select 1 from public.training_coach_client_assignments as assignment
    where assignment.coach_user_id = (select auth.uid())
      and assignment.client_email = lower(btrim(target_client_email))
  );
$$;

revoke all on function public.is_training_coach(), public.training_coach_can_access_client(text)
  from public, anon, authenticated;
grant execute on function public.is_training_coach(), public.training_coach_can_access_client(text)
  to authenticated;

create policy "Training coaches read assigned client programs"
  on public.client_programs for select to authenticated
  using (public.training_coach_can_access_client(client_email));

create policy "Training coaches read assigned client workout logs"
  on public.client_workout_logs for select to authenticated
  using (public.training_coach_can_access_client(client_email));

create policy "Training coaches create assigned client workout logs"
  on public.client_workout_logs for insert to authenticated
  with check (public.training_coach_can_access_client(client_email));

create policy "Training coaches update assigned client workout logs"
  on public.client_workout_logs for update to authenticated
  using (public.training_coach_can_access_client(client_email))
  with check (public.training_coach_can_access_client(client_email));

create policy "Training coaches reconcile assigned client workout logs"
  on public.client_workout_logs for delete to authenticated
  using (public.training_coach_can_access_client(client_email));

-- Explicit actor scope also applies when the signed-in coach is the legacy
-- admin, whose ordinary coach web portal retains its existing broader access.
create view public.training_coach_programs with (security_invoker = true) as
select program.id, program.client_email, program.client_name, program.client_archived,
  program.active, program.account_type, program.membership_type, program.updated_at,
  program.workouts, program.client_workout_layout
from public.client_programs as program
join public.training_coach_client_assignments as assignment
  on assignment.client_email = lower(btrim(program.client_email))
where assignment.coach_user_id = (select auth.uid()) and (select public.is_training_coach());

create view public.training_coach_workout_logs with (security_invoker = true) as
select log.*
from public.client_workout_logs as log
join public.training_coach_client_assignments as assignment
  on assignment.client_email = lower(btrim(log.client_email))
where assignment.coach_user_id = (select auth.uid()) and (select public.is_training_coach());

revoke all on public.training_coach_programs, public.training_coach_workout_logs
  from public, anon, authenticated;
grant select on public.training_coach_programs, public.training_coach_workout_logs to authenticated;

-- Keep a coach who can work with more than one client from accidentally
-- moving a saved set between them. Auth email rekeying and owner tools retain
-- their established behavior.
create function fwb_private.prevent_training_coach_log_owner_change()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if lower(btrim(new.client_email)) is distinct from lower(btrim(old.client_email))
    and current_user = 'authenticated'
    and public.is_training_coach()
    and not public.is_coach_admin()
  then
    raise exception 'A saved workout set must stay with its client' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function fwb_private.prevent_training_coach_log_owner_change()
  from public, anon, authenticated, service_role;
create trigger prevent_training_coach_log_owner_change
before update of client_email on public.client_workout_logs
for each row execute function fwb_private.prevent_training_coach_log_owner_change();

-- Only the existing business owner is enrolled automatically. Use the latest
-- active, nonarchived program per client to honor current membership status.
insert into public.training_coaches (coach_user_id)
select id from auth.users
where lower(btrim(email)) = 'benjaminbenz.fit@gmail.com'
  and email_confirmed_at is not null
on conflict (coach_user_id) do nothing;

with current_programs as (
  select distinct on (lower(btrim(client_email)))
    lower(btrim(client_email)) as client_email, membership_type, account_type
  from public.client_programs
  where active and not coalesce(client_archived, false) and nullif(btrim(client_email), '') is not null
  order by lower(btrim(client_email)), updated_at desc nulls last, id
)
insert into public.training_coach_client_assignments (client_email, coach_user_id)
select program.client_email, coach.coach_user_id
from current_programs as program
cross join public.training_coaches as coach
join auth.users as owner on owner.id = coach.coach_user_id
  and lower(btrim(owner.email)) = 'benjaminbenz.fit@gmail.com' and owner.email_confirmed_at is not null
where program.membership_type = 'personal_training' and program.account_type is distinct from 'beta_tester'
  and coach.is_active
on conflict (client_email) do nothing;

-- Single-coach onboarding follows existing membership approvals. With
-- multiple active coaches, an owner chooses the assignment explicitly.
create function fwb_private.assign_sole_training_coach()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  client_key text := lower(btrim(new.client_email));
begin
  -- The trusted membership approval Edge Functions write as service_role.
  if current_user not in ('postgres', 'service_role')
    or not coalesce(new.active, false) or coalesce(new.client_archived, false)
    or new.membership_type is distinct from 'personal_training' or new.account_type = 'beta_tester'
    or nullif(client_key, '') is null
  then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.active and not coalesce(old.client_archived, false)
      and old.membership_type = 'personal_training' and old.account_type is distinct from 'beta_tester'
    then
      return new;
    end if;
  end if;
  if exists (
    select 1 from public.client_programs as other
    where lower(btrim(other.client_email)) = client_key and other.id <> new.id
      and other.active and not coalesce(other.client_archived, false)
      and other.membership_type = 'personal_training' and other.account_type is distinct from 'beta_tester'
  ) then
    return new;
  end if;

  insert into public.training_coach_client_assignments (client_email, coach_user_id)
  select client_key, active.coach_user_id
  from (
    select coach.coach_user_id, count(*) over () as active_count
    from public.training_coaches as coach where coach.is_active
  ) as active
  where active.active_count = 1
  on conflict (client_email) do nothing;
  return new;
end;
$$;
revoke all on function fwb_private.assign_sole_training_coach()
  from public, anon, authenticated, service_role;
create trigger assign_sole_training_coach
after insert or update of membership_type, active, client_archived, account_type on public.client_programs
for each row execute function fwb_private.assign_sole_training_coach();

-- Existing client records are keyed by confirmed Auth email. Keep the
-- assignment attached when the email changes, and clear it on account deletion.
create function fwb_private.sync_training_coach_client_assignment_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_key text := lower(btrim(old.email));
  new_key text;
begin
  if tg_op = 'DELETE' then
    delete from public.training_coach_client_assignments where client_email = old_key;
    return old;
  end if;
  new_key := lower(btrim(new.email));
  if nullif(new_key, '') is not null and new_key is distinct from old_key then
    update public.training_coach_client_assignments set client_email = new_key where client_email = old_key;
  end if;
  return new;
end;
$$;
revoke all on function fwb_private.sync_training_coach_client_assignment_email()
  from public, anon, authenticated, service_role;
create trigger fwb_sync_training_coach_client_assignment_email
after update of email or delete on auth.users
for each row execute function fwb_private.sync_training_coach_client_assignment_email();

notify pgrst, 'reload schema';
