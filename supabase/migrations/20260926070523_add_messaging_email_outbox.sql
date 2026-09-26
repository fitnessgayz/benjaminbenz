-- Transactional email notifications for new client/coach messages only.
-- Message content is never copied to this queue or to an email payload.
create table messaging_private.email_outbox (
  id uuid primary key default gen_random_uuid(),
  message_id bigint not null references messaging_private.messages(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_email text not null,
  recipient_role text not null check (recipient_role in ('client', 'coach')),
  sender_name text not null check (char_length(sender_name) between 1 and 100),
  sender_role text not null check (sender_role in ('client', 'coach')),
  destination_url text not null check (destination_url in (
    'https://benjaminbenz.com/client-dashboard.html?messages=1',
    'https://benjaminbenz.com/coach-admin.html?tab=inbox'
  )),
  status text not null default 'pending' check (status in ('pending', 'leased', 'sent', 'canceled', 'dead')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  next_attempt_at timestamptz not null default clock_timestamp(),
  first_attempt_at timestamptz,
  retry_until timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_payload jsonb check (provider_payload is null or jsonb_typeof(provider_payload) = 'object'),
  provider_message_id text,
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  unique (message_id, recipient_user_id)
);
create index email_outbox_recipient_idx on messaging_private.email_outbox (recipient_user_id);
create index email_outbox_pending_idx on messaging_private.email_outbox (next_attempt_at, created_at)
  where status = 'pending';
create index email_outbox_lease_idx on messaging_private.email_outbox (lease_expires_at)
  where status = 'leased';
alter table messaging_private.email_outbox enable row level security;
revoke all on messaging_private.email_outbox from public, anon, authenticated, service_role;
create policy email_outbox_service_only on messaging_private.email_outbox
  for all to service_role using (true) with check (true);

create function messaging_private.email_recipient_eligible(p_user_id uuid, p_email text, p_role text)
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (select 1 from auth.users u where u.id = p_user_id
    and lower(btrim(u.email)) = p_email and u.email_confirmed_at is not null
    and u.deleted_at is null and not coalesce(u.is_anonymous, false)
    and (u.banned_until is null or u.banned_until <= now())
    and (p_role = 'client' or (p_role = 'coach' and lower(btrim(u.email)) = 'benjaminbenz.fit@gmail.com')));
$$;

create function messaging_private.enqueue_message_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_thread messaging_private.conversations%rowtype; v_name text;
begin
  select c.* into strict v_thread from messaging_private.conversations c where c.id = new.conversation_id;
  v_name := case when new.sender_role = 'coach' then 'Benjamin'
    else coalesce(nullif(btrim(left(regexp_replace(v_thread.client_name, '[[:cntrl:]]', ' ', 'g'), 100)), ''), 'Your client') end;
  insert into messaging_private.email_outbox
    (message_id, recipient_user_id, recipient_email, recipient_role, sender_name, sender_role, destination_url)
  select new.id, u.id, lower(btrim(u.email)),
    case when new.sender_role = 'client' then 'coach' else 'client' end,
    v_name, new.sender_role,
    case when new.sender_role = 'client' then 'https://benjaminbenz.com/coach-admin.html?tab=inbox'
      else 'https://benjaminbenz.com/client-dashboard.html?messages=1' end
  from auth.users u
  where u.id <> new.sender_user_id
    and ((new.sender_role = 'client' and lower(btrim(u.email)) = 'benjaminbenz.fit@gmail.com')
      or (new.sender_role = 'coach' and u.id = v_thread.client_user_id))
    and messaging_private.email_recipient_eligible(u.id, lower(btrim(u.email)),
      case when new.sender_role = 'client' then 'coach' else 'client' end)
  on conflict (message_id, recipient_user_id) do nothing;
  return new;
end;
$$;
create trigger message_email_notification after insert on messaging_private.messages
  for each row execute function messaging_private.enqueue_message_email();

-- Preserve the recipient snapshot and original provider request even if sender
-- settings or templates change before a retry. There is no client write grant.
create function messaging_private.preserve_email_payload()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if row(new.message_id, new.recipient_user_id, new.recipient_email, new.recipient_role,
      new.sender_name, new.sender_role, new.destination_url, new.created_at)
    is distinct from row(old.message_id, old.recipient_user_id, old.recipient_email, old.recipient_role,
      old.sender_name, old.sender_role, old.destination_url, old.created_at)
    or (old.provider_payload is not null and new.provider_payload is distinct from old.provider_payload)
    or (old.first_attempt_at is not null and new.first_attempt_at is distinct from old.first_attempt_at)
    or (old.retry_until is not null and new.retry_until is distinct from old.retry_until) then
    raise exception 'Email delivery payload is immutable.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger preserve_email_payload before update on messaging_private.email_outbox
  for each row execute function messaging_private.preserve_email_payload();

create function messaging_private.claim_email_notifications(p_from_email text, p_limit integer)
returns table (id uuid, lease_token uuid, provider_payload jsonb, idempotency_key text,
  attempts integer, first_attempt_at timestamptz, retry_until timestamptz, lease_expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_from_email is null or char_length(p_from_email) not between 3 and 320
    or p_from_email ~ '[[:cntrl:]]' or position('@' in p_from_email) = 0
    or p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Invalid email dispatch configuration.' using errcode = '22023';
  end if;
  -- A changed address must never receive an old message notification intended
  -- for its previous owner. Do not retarget queued payloads to a new address.
  update messaging_private.email_outbox q set status = 'canceled', last_error_code = 'recipient_unavailable',
    lease_token = null, lease_expires_at = null
  where (q.status = 'pending' or (q.status = 'leased' and q.lease_expires_at <= v_now))
    and not messaging_private.email_recipient_eligible(q.recipient_user_id, q.recipient_email, q.recipient_role);
  update messaging_private.email_outbox q set status = 'dead', last_error_code = 'retry_window_exhausted',
    lease_token = null, lease_expires_at = null
  where (q.status = 'pending' or (q.status = 'leased' and q.lease_expires_at <= v_now))
    and (q.attempts >= 10 or q.retry_until <= v_now);
  return query
  with ready as (
    select q.id from messaging_private.email_outbox q
    where (q.status = 'pending' and q.next_attempt_at <= v_now)
      or (q.status = 'leased' and q.lease_expires_at <= v_now)
    order by q.created_at, q.id for update skip locked limit p_limit
  ), claimed as (
    update messaging_private.email_outbox q set status = 'leased', lease_token = gen_random_uuid(),
      lease_expires_at = v_now + interval '2 minutes', attempts = q.attempts + 1,
      first_attempt_at = coalesce(q.first_attempt_at, v_now),
      retry_until = coalesce(q.retry_until, v_now + interval '23 hours'),
      provider_payload = coalesce(q.provider_payload, jsonb_build_object(
        'from', p_from_email, 'to', jsonb_build_array(q.recipient_email),
        'subject', case when q.sender_role = 'coach' then 'New message from your coach · FWB Training'
          else q.sender_name || ' sent you a message · FWB Training' end,
        'text', q.sender_name || E' sent you a message in FWB Training.\n\nOpen your conversation to read and reply:\n'
          || q.destination_url || E'\n\nYour private message stays in FWB Training.')),
      last_error_code = null
    from ready where q.id = ready.id
    returning q.id, q.lease_token, q.provider_payload, q.attempts,
      q.first_attempt_at, q.retry_until, q.lease_expires_at
  ) select c.id, c.lease_token, c.provider_payload, 'fwb-message-email/' || c.id::text,
      c.attempts, c.first_attempt_at, c.retry_until, c.lease_expires_at from claimed c;
end;
$$;

create function messaging_private.validate_email_notification(p_delivery_id uuid, p_lease_token uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_job messaging_private.email_outbox%rowtype;
begin
  select q.* into v_job from messaging_private.email_outbox q
    where q.id = p_delivery_id and q.lease_token = p_lease_token and q.status = 'leased' for update;
  if not found or v_job.lease_expires_at <= clock_timestamp() then return false; end if;
  if v_job.retry_until <= clock_timestamp() then
    update messaging_private.email_outbox set status = 'dead', last_error_code = 'retry_window_exhausted',
      lease_token = null, lease_expires_at = null where id = v_job.id;
    return false;
  end if;
  if not messaging_private.email_recipient_eligible(v_job.recipient_user_id, v_job.recipient_email, v_job.recipient_role) then
    update messaging_private.email_outbox set status = 'canceled', last_error_code = 'recipient_unavailable',
      lease_token = null, lease_expires_at = null where id = v_job.id;
    return false;
  end if;
  return true;
end;
$$;

create function messaging_private.complete_email_notification(p_delivery_id uuid, p_lease_token uuid, p_provider_message_id text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  if p_provider_message_id is null or char_length(p_provider_message_id) not between 1 and 256
    or p_provider_message_id ~ '[[:cntrl:]]' then
    raise exception 'A provider receipt is required.' using errcode = '22023';
  end if;
  update messaging_private.email_outbox q set status = 'sent', delivered_at = clock_timestamp(),
    provider_message_id = p_provider_message_id, lease_token = null, lease_expires_at = null, last_error_code = null
  where q.id = p_delivery_id and q.lease_token = p_lease_token and q.status = 'leased';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

create function messaging_private.retry_email_notification(
  p_delivery_id uuid, p_lease_token uuid, p_error_code text, p_retryable boolean, p_retry_after_seconds integer
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_job messaging_private.email_outbox%rowtype; v_delay integer;
begin
  if p_error_code is null or p_error_code !~ '^[a-zA-Z0-9_:-]{1,100}$'
    or p_retryable is null or p_retry_after_seconds is null or p_retry_after_seconds not between 0 and 3600 then
    raise exception 'Use a safe delivery error code and bounded retry delay.' using errcode = '22023';
  end if;
  select q.* into v_job from messaging_private.email_outbox q
    where q.id = p_delivery_id and q.lease_token = p_lease_token and q.status = 'leased' for update;
  if not found then return false; end if;
  v_delay := greatest(p_retry_after_seconds, least(3600, (60 * power(2, v_job.attempts - 1))::integer));
  update messaging_private.email_outbox q set
    status = case when p_retryable and q.attempts < 10 and clock_timestamp() + make_interval(secs => v_delay) < q.retry_until
      then 'pending' else 'dead' end,
    next_attempt_at = clock_timestamp() + make_interval(secs => v_delay),
    last_error_code = p_error_code, lease_token = null, lease_expires_at = null
    where q.id = v_job.id;
  return true;
end;
$$;

create function public.messaging_claim_email_notifications(p_from_email text, p_limit integer default 20)
returns table (id uuid, lease_token uuid, provider_payload jsonb, idempotency_key text,
  attempts integer, first_attempt_at timestamptz, retry_until timestamptz, lease_expires_at timestamptz)
language sql security invoker set search_path = ''
as $$ select * from messaging_private.claim_email_notifications(p_from_email, p_limit); $$;
create function public.messaging_validate_email_notification(p_delivery_id uuid, p_lease_token uuid)
returns boolean language sql security invoker set search_path = ''
as $$ select messaging_private.validate_email_notification(p_delivery_id, p_lease_token); $$;
create function public.messaging_complete_email_notification(p_delivery_id uuid, p_lease_token uuid, p_provider_message_id text)
returns boolean language sql security invoker set search_path = ''
as $$ select messaging_private.complete_email_notification(p_delivery_id, p_lease_token, p_provider_message_id); $$;
create function public.messaging_retry_email_notification(p_delivery_id uuid, p_lease_token uuid,
  p_error_code text, p_retryable boolean default true, p_retry_after_seconds integer default 0)
returns boolean language sql security invoker set search_path = ''
as $$ select messaging_private.retry_email_notification(p_delivery_id, p_lease_token, p_error_code, p_retryable, p_retry_after_seconds); $$;

revoke all on function messaging_private.email_recipient_eligible(uuid, text, text),
  messaging_private.enqueue_message_email(), messaging_private.preserve_email_payload(),
  messaging_private.claim_email_notifications(text, integer), messaging_private.validate_email_notification(uuid, uuid),
  messaging_private.complete_email_notification(uuid, uuid, text),
  messaging_private.retry_email_notification(uuid, uuid, text, boolean, integer)
  from public, anon, authenticated, service_role;
grant usage on schema messaging_private to service_role;
grant execute on function messaging_private.claim_email_notifications(text, integer),
  messaging_private.validate_email_notification(uuid, uuid), messaging_private.complete_email_notification(uuid, uuid, text),
  messaging_private.retry_email_notification(uuid, uuid, text, boolean, integer) to service_role;
revoke all on function public.messaging_claim_email_notifications(text, integer),
  public.messaging_validate_email_notification(uuid, uuid), public.messaging_complete_email_notification(uuid, uuid, text),
  public.messaging_retry_email_notification(uuid, uuid, text, boolean, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.messaging_claim_email_notifications(text, integer),
  public.messaging_validate_email_notification(uuid, uuid), public.messaging_complete_email_notification(uuid, uuid, text),
  public.messaging_retry_email_notification(uuid, uuid, text, boolean, integer) to service_role;
