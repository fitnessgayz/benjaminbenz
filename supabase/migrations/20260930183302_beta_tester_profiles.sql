alter table public.client_programs
add column if not exists account_type text not null default 'client';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'client_programs_account_type_check'
      and conrelid = 'public.client_programs'::regclass
  ) then
    alter table public.client_programs
    add constraint client_programs_account_type_check
    check (account_type in ('client', 'beta_tester'));
  end if;
end;
$$;

comment on column public.client_programs.account_type is
  'Separates personal-training clients from beta testers who use the app without enrolling in coaching.';

-- Beta testers need a client_programs row because the app stores their setup and
-- workout data there. Keep client-only notification automations away from those rows.
-- Preserve the deployed trigger functions because production can legitimately be
-- on either notification backend while a rolling migration is in progress.
do $$
declare
  program_trigger_function regprocedure;
  balance_trigger_function regprocedure;
begin
  select trigger_row.tgfoid::regprocedure
  into program_trigger_function
  from pg_trigger trigger_row
  where trigger_row.tgrelid = 'public.client_programs'::regclass
    and trigger_row.tgname = 'fwb_program_notifications'
    and not trigger_row.tgisinternal;

  select trigger_row.tgfoid::regprocedure
  into balance_trigger_function
  from pg_trigger trigger_row
  where trigger_row.tgrelid = 'public.client_programs'::regclass
    and trigger_row.tgname = 'fwb_client_session_balance_notifications'
    and not trigger_row.tgisinternal;

  if program_trigger_function is null or balance_trigger_function is null then
    raise exception 'Expected client notification triggers were not found';
  end if;

  drop trigger fwb_program_notifications on public.client_programs;
  execute format(
    'create trigger fwb_program_notifications after insert or update on public.client_programs for each row when (new.account_type = ''client'') execute function %s',
    program_trigger_function
  );

  drop trigger fwb_client_session_balance_notifications on public.client_programs;
  execute format(
    'create trigger fwb_client_session_balance_notifications after insert or update of session_count_used, session_count_total, session_package_history, active, client_archived, client_email on public.client_programs for each row when (new.account_type = ''client'') execute function %s',
    balance_trigger_function
  );
end;
$$;

insert into public.client_programs (
  client_email,
  client_name,
  client_phone,
  initials,
  program_title,
  program_summary,
  session_count_used,
  session_count_total,
  session_dates,
  fitness_goal,
  focus_target,
  height,
  starting_weight,
  starting_bodyfat,
  coach_note_title,
  coach_note_body,
  workouts,
  active,
  client_archived,
  account_type
)
select
  tester.client_email,
  tester.client_name,
  '',
  tester.initials,
  'Beta Test Access',
  'Beta tester account — not enrolled as a personal-training client.',
  0,
  0,
  '[]'::jsonb,
  '',
  '',
  'Not set',
  'Not set',
  'Not set',
  '',
  '',
  '[]'::jsonb,
  true,
  false,
  'beta_tester'
from (
  values
    ('kenny.t.walter@gmail.com', 'Kenny Walter', 'KW'),
    ('trickedouttruck90@yahoo.com', 'Sam', 'S'),
    ('beauheide@gmail.com', 'Beau Heide', 'BH'),
    ('jmosquera89@gmail.com', 'Jefferson Mosquera', 'JM'),
    ('shaneturner36@gmail.com', 'Shane Turner', 'ST'),
    ('biggayjohn@gmail.com', 'John Skogstad', 'JS'),
    ('gladstone.ken@gmail.com', 'Kenneth Gladstone', 'KG'),
    ('realmchild@gmail.com', 'Chad Miller', 'CM'),
    ('joseph.hinchcliffe1@gmail.com', 'Joseph Hinchcliffe', 'JH')
) as tester(client_email, client_name, initials)
where not exists (
  select 1
  from public.client_programs existing
  where lower(existing.client_email) = lower(tester.client_email)
);
