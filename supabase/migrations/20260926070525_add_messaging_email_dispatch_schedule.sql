-- Dedicated worker credential and an initially disabled, idle-aware scheduler.
-- This migration sends no HTTP request and never backfills messages.
create table messaging_private.email_dispatch_config (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);
alter table messaging_private.email_dispatch_config enable row level security;
revoke all on messaging_private.email_dispatch_config from public, anon, authenticated, service_role;
create policy email_dispatch_config_service_only on messaging_private.email_dispatch_config
  for all to service_role using (true) with check (true);
insert into messaging_private.email_dispatch_config (id, enabled) values (1, false);

do $credential$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'fwb_messaging_email_worker_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
      'fwb_messaging_email_worker_token', 'Private FWB message-email dispatcher authentication');
  end if;
end;
$credential$;

create function messaging_private.email_worker_config()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('worker_token', (select s.decrypted_secret from vault.decrypted_secrets s
      where s.name = 'fwb_messaging_email_worker_token' limit 1),
    'enabled', coalesce((select c.enabled from messaging_private.email_dispatch_config c where c.id = 1), false));
$$;
create function public.messaging_email_worker_config()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select messaging_private.email_worker_config(); $$;
revoke all on function messaging_private.email_worker_config(), public.messaging_email_worker_config()
  from public, anon, authenticated, service_role;
grant execute on function messaging_private.email_worker_config(), public.messaging_email_worker_config() to service_role;

create function messaging_private.dispatch_email_notifications()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_token text; v_request_id bigint;
begin
  if not coalesce((select c.enabled from messaging_private.email_dispatch_config c where c.id = 1), false)
    or not exists (select 1 from messaging_private.email_outbox q
      where (q.status = 'pending' and q.next_attempt_at <= clock_timestamp())
        or (q.status = 'leased' and q.lease_expires_at <= clock_timestamp())) then
    return null;
  end if;
  select s.decrypted_secret into v_token from vault.decrypted_secrets s
    where s.name = 'fwb_messaging_email_worker_token' limit 1;
  if v_token is null or v_token = '' then return null; end if;
  select net.http_post(
    url := 'https://qukdfjeupjhpthfbaonv.supabase.co/functions/v1/send-message-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_token),
    body := jsonb_build_object('action', 'dispatch'), timeout_milliseconds := 120000
  ) into v_request_id;
  return v_request_id;
end;
$$;
revoke all on function messaging_private.dispatch_email_notifications() from public, anon, authenticated, service_role;

do $schedule$
declare v_job_id bigint;
begin
  select cron.schedule('fwb-messaging-email-dispatch', '* * * * *',
    'select messaging_private.dispatch_email_notifications();') into v_job_id;
  perform cron.alter_job(job_id := v_job_id, active := false);
end;
$schedule$;
