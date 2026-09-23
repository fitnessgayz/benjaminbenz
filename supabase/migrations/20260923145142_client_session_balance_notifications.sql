-- Client website alerts: one low-balance notice and one out-of-sessions notice
-- per package. No backfill: existing low balances are shown by the website.
-- This narrow producer supports both the deployed legacy inbox and the newer
-- notification schema without changing coach notifications or push settings.
create schema if not exists fwb_private;
revoke all on schema fwb_private from public, anon, authenticated;

create table if not exists fwb_private.client_session_balance_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  package_cycle bigint not null default 1,
  package_history jsonb not null default '[]'::jsonb,
  used integer not null,
  total integer not null,
  low_notified boolean not null default false,
  out_notified boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table fwb_private.client_session_balance_state enable row level security;
revoke all on table fwb_private.client_session_balance_state from public, anon, authenticated;

-- Initialize bookkeeping only, never inbox notifications. An existing low/out
-- package must stay marked if its program is archived and copied after rollout.
-- Select the same latest active program used for the website's package balance.
insert into fwb_private.client_session_balance_state
  (user_id, package_history, used, total, low_notified, out_notified)
select user_id, coalesce(session_package_history, '[]'::jsonb),
  session_count_used, session_count_total,
  greatest(session_count_total - session_count_used, 0) <= 3,
  greatest(session_count_total - session_count_used, 0) = 0
from (
  select distinct on (account.id) account.id as user_id,
    program.session_package_history, program.session_count_used, program.session_count_total
  from auth.users as account
  join public.client_programs as program on lower(btrim(program.client_email)) = lower(account.email)
  where account.deleted_at is null and program.active is true and program.client_archived is not true
  order by account.id, program.updated_at desc nulls last, program.created_at desc nulls last, program.id desc
) as current_package
where session_count_total > 0 and session_count_used >= 0
on conflict (user_id) do nothing;

create or replace function fwb_private.notify_client_session_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  recipient uuid;
  prior fwb_private.client_session_balance_state%rowtype;
  remaining integer;
  old_remaining integer;
  old_eligible boolean := false;
  renewed boolean;
  notification_state text;
  notification_title text;
  notification_body text;
  notification_key text;
  preference_enabled boolean := true;
  modern_inbox boolean;
  current_history jsonb := coalesce(new.session_package_history, '[]'::jsonb);
begin
  if new.active is distinct from true or new.client_archived is true
     or new.session_count_total is null or new.session_count_total <= 0
     or new.session_count_used is null or new.session_count_used < 0 then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.session_count_used is not distinct from old.session_count_used
       and new.session_count_total is not distinct from old.session_count_total
       and new.session_package_history is not distinct from old.session_package_history
       and new.active is not distinct from old.active
       and new.client_archived is not distinct from old.client_archived
       and lower(btrim(new.client_email)) is not distinct from lower(btrim(old.client_email)) then
      return new;
    end if;
    old_eligible := old.active is true and old.client_archived is not true
      and old.session_count_total > 0 and old.session_count_used >= 0
      and lower(btrim(old.client_email)) = lower(btrim(new.client_email));
  end if;

  select id into recipient from auth.users
   where lower(email) = lower(btrim(new.client_email)) and deleted_at is null
   order by created_at, id limit 1;
  if recipient is null then return new; end if;

  remaining := greatest(new.session_count_total - new.session_count_used, 0);
  old_remaining := case when old_eligible
    then greatest(old.session_count_total - old.session_count_used, 0) else null end;

  -- Seed from OLD only on the first real balance change. This avoids a retroactive
  -- low notice for an already-low package after deployment, while still detecting
  -- low -> out. The user row lock deduplicates updates to multiple program rows.
  insert into fwb_private.client_session_balance_state
    (user_id, package_history, used, total, low_notified, out_notified)
  values (
    recipient,
    case when old_eligible then coalesce(old.session_package_history, '[]'::jsonb) else current_history end,
    case when old_eligible then old.session_count_used else new.session_count_used end,
    case when old_eligible then old.session_count_total else new.session_count_total end,
    coalesce(old_remaining <= 3, false),
    coalesce(old_remaining = 0, false)
  ) on conflict (user_id) do nothing;

  select * into prior from fwb_private.client_session_balance_state
   where user_id = recipient for update;

  renewed := current_history is distinct from prior.package_history
    or (new.session_count_used = 0 and prior.used > 0)
    or (new.session_count_total > prior.total and remaining > greatest(prior.total - prior.used, 0));
  if renewed then
    prior.package_cycle := prior.package_cycle + 1;
    prior.low_notified := false;
    prior.out_notified := false;
  end if;

  if remaining = 0 and not prior.out_notified then
    notification_state := 'out';
    notification_title := 'You’re out of coaching sessions';
    notification_body := 'You have no sessions remaining in your current package. Contact Benjamin to renew.';
    prior.low_notified := true;
    prior.out_notified := true;
  elsif remaining between 1 and 3 and not prior.low_notified then
    notification_state := 'low';
    notification_title := case when remaining = 1 then '1 coaching session remaining'
      else remaining::text || ' coaching sessions remaining' end;
    notification_body := 'Your session package is running low. Contact Benjamin to plan your next package.';
    prior.low_notified := true;
  end if;

  update fwb_private.client_session_balance_state set
    package_cycle = prior.package_cycle, package_history = current_history,
    used = new.session_count_used, total = new.session_count_total,
    low_notified = prior.low_notified, out_notified = prior.out_notified,
    updated_at = now()
  where user_id = recipient;

  if notification_state is null then return new; end if;

  -- An absent preferences row means the default is enabled. Respect explicit
  -- session-balance opt-outs without creating settings or enabling browser push.
  -- An upgraded inbox uses its current preferences, even if legacy tables remain.
  modern_inbox := exists (select 1 from information_schema.columns where table_schema = 'public'
    and table_name = 'client_notifications' and column_name = 'action_url');
  if modern_inbox and to_regclass('public.client_notification_preferences') is not null then
    execute $query$
      select not exists (
        select 1 from public.client_notification_preferences as preference where user_id = $1
          and to_jsonb(preference) -> 'session_balance' = 'false'::jsonb
      )
    $query$ into preference_enabled using recipient;
  elsif not modern_inbox and to_regclass('public.fwb_notification_settings') is not null then
    execute $query$
      select not exists (
        select 1 from public.fwb_notification_settings where user_id = $1
          and (categories -> 'low_sessions' = 'false'::jsonb
            or categories -> 'session_balance' = 'false'::jsonb)
      )
    $query$ into preference_enabled using recipient;
  end if;
  if not preference_enabled then return new; end if;

  notification_key := 'client-session-balance:v2:' || recipient::text || ':'
    || prior.package_cycle::text || ':' || notification_state;
  if modern_inbox then
    execute $query$
      insert into public.client_notifications
        (user_id, recipient_role, kind, title, body, action_url, dedupe_key, metadata)
      values ($1, 'client', 'session_balance', $2, $3,
        '/client-dashboard.html?tab=sessions', $4, $5)
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    $query$ using recipient, notification_title, notification_body, notification_key,
      jsonb_build_object('program_id', new.id, 'remaining', remaining, 'balance_state', notification_state);
  else
    execute $query$
      insert into public.client_notifications
        (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
      values ($1, 'general', $2, $3, 'low_sessions',
        '/client-dashboard.html?tab=sessions', $4)
      on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing
    $query$ using recipient, notification_title, notification_body, notification_key;
  end if;
  return new;
end;
$function$;

revoke all on function fwb_private.notify_client_session_balance() from public, anon, authenticated;

-- Replace only the former CLIENT balance emission in each known producer.
-- Retain its other program/note/nutrition events and its existing COACH threshold.
-- Fail closed if a producer has drifted instead of silently creating duplicates.
do $migration$
declare
  producer regprocedure;
  definition text;
  replacement text;
  pattern text;
begin
  foreach producer in array array[
    to_regprocedure('fwb_private.notify_program()'),
    to_regprocedure('private.fwb_program_notification_trigger()')
  ] loop
    if producer is null then continue; end if;
    definition := pg_get_functiondef(producer);
    if position('client-session-balance-v2: dedicated trigger' in definition) > 0 then continue; end if;
    pattern := case when producer = to_regprocedure('fwb_private.notify_program()')
      then $pattern$perform\s+fwb_private\.emit\(\s*new\.client_email\s*,\s*'low_sessions'\s*,[^;]*;$pattern$
      else $pattern$perform\s+private\.fwb_queue_notification\(\s*new\.client_email\s*,\s*'client'\s*,\s*'session_balance'\s*,[^;]*;$pattern$
    end;
    replacement := regexp_replace(definition, pattern,
      '-- client-session-balance-v2: dedicated trigger', 'i');
    if replacement = definition then
      raise exception 'Session balance producer % does not match the reviewed definition', producer;
    end if;
    execute replacement;
  end loop;
end;
$migration$;

drop trigger if exists fwb_client_session_balance_notifications on public.client_programs;
create trigger fwb_client_session_balance_notifications
after insert or update of session_count_used, session_count_total, session_package_history,
  active, client_archived, client_email on public.client_programs
for each row execute function fwb_private.notify_client_session_balance();
