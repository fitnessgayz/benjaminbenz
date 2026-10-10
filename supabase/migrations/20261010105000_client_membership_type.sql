alter table public.client_programs
add column if not exists membership_type text;

update public.client_programs
set membership_type = case
  when account_type = 'beta_tester' then 'app_access_only'
  else 'app_access_only'
end
where membership_type is null;

alter table public.client_programs
alter column membership_type set default 'app_access_only';

alter table public.client_programs
alter column membership_type set not null;

alter table public.client_programs
add constraint client_programs_membership_type_check
check (membership_type in ('personal_training', 'online_training', 'app_access_only'));

alter table public.client_programs
add constraint client_programs_beta_tester_membership_check
check (account_type <> 'beta_tester' or membership_type = 'app_access_only');

comment on column public.client_programs.membership_type is
  'Coach-managed membership. New and beta profiles start with app access; Benjamin confirms personal and online training.';

alter table public.client_programs
add column if not exists membership_requested_type text,
add column if not exists membership_requested_at timestamptz,
add column if not exists membership_confirmed_at timestamptz,
add column if not exists first_login_questionnaire_completed_at timestamptz;

alter table public.client_programs
add constraint client_programs_membership_requested_type_check
check (membership_requested_type is null or membership_requested_type in ('personal_training', 'online_training', 'app_access_only'));

comment on column public.client_programs.membership_requested_type is
  'The client choice from the first website login questionnaire; coaching choices require coach confirmation.';

create or replace function public.protect_client_membership_fields()
returns trigger language plpgsql as $$
begin
  if current_user not in ('service_role', 'postgres') and (
    new.membership_type is distinct from old.membership_type or
    new.membership_requested_type is distinct from old.membership_requested_type or
    new.membership_requested_at is distinct from old.membership_requested_at or
    new.membership_confirmed_at is distinct from old.membership_confirmed_at or
    new.first_login_questionnaire_completed_at is distinct from old.first_login_questionnaire_completed_at
  ) then
    raise exception 'Membership changes require the verified questionnaire or coach approval';
  end if;
  return new;
end;
$$;

create trigger protect_client_membership_fields
before update on public.client_programs
for each row execute function public.protect_client_membership_fields();

create or replace function public.inherit_client_intake_completion()
returns trigger language plpgsql as $$
begin
  if new.first_login_questionnaire_completed_at is null then
    select max(first_login_questionnaire_completed_at)
      into new.first_login_questionnaire_completed_at
    from public.client_programs
    where lower(client_email) = lower(new.client_email);
  end if;
  return new;
end;
$$;

create trigger inherit_client_intake_completion
before insert on public.client_programs
for each row execute function public.inherit_client_intake_completion();
