-- Extend the existing readiness/check-in record so daily readiness and the
-- once-weekly coaching update can coexist without a duplicate client table.
alter table public.client_check_ins
  add column if not exists weekly_submitted_at timestamptz,
  add column if not exists recovery_summary text,
  add column if not exists pain_limitations text,
  add column if not exists coach_question text,
  add column if not exists coach_response text,
  add column if not exists coach_responded_at timestamptz;

alter table public.client_check_ins
  drop constraint if exists client_check_ins_recovery_summary_check,
  add constraint client_check_ins_recovery_summary_check
    check (recovery_summary is null or char_length(recovery_summary) <= 1000),
  drop constraint if exists client_check_ins_pain_limitations_check,
  add constraint client_check_ins_pain_limitations_check
    check (pain_limitations is null or char_length(pain_limitations) <= 1000),
  drop constraint if exists client_check_ins_coach_question_check,
  add constraint client_check_ins_coach_question_check
    check (coach_question is null or char_length(coach_question) <= 1000),
  drop constraint if exists client_check_ins_coach_response_check,
  add constraint client_check_ins_coach_response_check
    check (coach_response is null or char_length(coach_response) <= 2000),
  drop constraint if exists client_check_ins_weekly_answers_check,
  add constraint client_check_ins_weekly_answers_check
    check (
      weekly_submitted_at is null
      or (
        nullif(btrim(win), '') is not null
        and nullif(btrim(challenge), '') is not null
        and nullif(btrim(recovery_summary), '') is not null
        and nullif(btrim(pain_limitations), '') is not null
      )
    ),
  drop constraint if exists client_check_ins_weekly_occurs_on_monday_check,
  add constraint client_check_ins_weekly_occurs_on_monday_check
    check (
      weekly_submitted_at is null
      or extract(isodow from occurred_on) = 1
    ),
  drop constraint if exists client_check_ins_coach_response_timestamp_check,
  add constraint client_check_ins_coach_response_timestamp_check
    check (
      (coach_response is null and coach_responded_at is null)
      or (nullif(btrim(coach_response), '') is not null and coach_responded_at is not null)
    );

create index if not exists client_check_ins_client_email_lower_idx
  on public.client_check_ins (lower(client_email));

create index if not exists client_check_ins_weekly_submitted_idx
  on public.client_check_ins (lower(client_email), weekly_submitted_at desc)
  where weekly_submitted_at is not null;

alter table public.client_check_ins enable row level security;

drop policy if exists "Clients and coach can read check-ins" on public.client_check_ins;
create policy "Clients and coach can read check-ins"
on public.client_check_ins
for select
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
);

drop policy if exists "Clients can create readiness check-ins" on public.client_check_ins;
create policy "Clients can create their check-ins"
on public.client_check_ins
for insert
to authenticated
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  and source = 'ios_app'
  and coach_response is null
  and coach_responded_at is null
);

drop policy if exists "Clients can update their iOS readiness check-ins" on public.client_check_ins;
create policy "Clients can update their own iOS check-ins"
on public.client_check_ins
for update
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
)
with check (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  and source = 'ios_app'
);

drop policy if exists "Coach admin can update client check-ins" on public.client_check_ins;
drop policy if exists "Clients can update their own iOS check-ins" on public.client_check_ins;
create policy "Clients and coach can update check-ins"
on public.client_check_ins
for update
to authenticated
using (
  lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
  or (select public.is_coach_admin())
)
with check (
  (
    lower(coalesce((select auth.jwt()) ->> 'email', '')) = lower(client_email)
    and source = 'ios_app'
  )
  or (select public.is_coach_admin())
);

create or replace function public.protect_client_check_in_coach_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_coach_admin()) then
    if new.coach_response is distinct from old.coach_response
      or new.coach_responded_at is distinct from old.coach_responded_at then
      raise exception 'Only the coach admin can change coach response fields'
        using errcode = '42501';
    end if;

    if old.weekly_submitted_at is not null and (
      new.win is distinct from old.win
      or new.challenge is distinct from old.challenge
      or new.recovery_summary is distinct from old.recovery_summary
      or new.pain_limitations is distinct from old.pain_limitations
      or new.coach_question is distinct from old.coach_question
      or new.weekly_submitted_at is distinct from old.weekly_submitted_at
    ) then
      raise exception 'Weekly check-ins cannot be edited after submission'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_client_check_in_coach_fields
  on public.client_check_ins;
create trigger protect_client_check_in_coach_fields
before update on public.client_check_ins
for each row
execute function public.protect_client_check_in_coach_fields();

revoke all on function public.protect_client_check_in_coach_fields() from public;
revoke all on function public.protect_client_check_in_coach_fields() from anon;
revoke all on function public.protect_client_check_in_coach_fields() from authenticated;

grant select, insert, update on public.client_check_ins to authenticated;
