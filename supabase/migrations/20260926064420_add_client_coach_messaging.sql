-- Private client/coach messaging. Public API functions are invoker wrappers;
-- only identity verification and atomic writes run with elevated privileges.
create schema if not exists messaging_private;
revoke all on schema messaging_private from public, anon, authenticated;
grant usage on schema messaging_private to authenticated;

create table messaging_private.conversations (
  id uuid primary key default gen_random_uuid(),
  client_user_id uuid not null unique references auth.users(id) on delete cascade,
  client_email text not null unique check (client_email = lower(btrim(client_email))),
  client_name text not null,
  created_at timestamptz not null default clock_timestamp()
);

create table messaging_private.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references messaging_private.conversations(id) on delete cascade,
  sender_user_id uuid not null,
  sender_role text not null check (sender_role in ('client', 'coach')),
  body text not null check (char_length(body) between 1 and 4000 and btrim(body, E' \t\n\r\f\v' || U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (sender_user_id, request_id)
);
create index messages_conversation_id_idx on messaging_private.messages (conversation_id, id desc);

create table messaging_private.read_cursors (
  conversation_id uuid not null references messaging_private.conversations(id) on delete cascade,
  viewer_user_id uuid not null references auth.users(id) on delete cascade,
  through_message_id bigint not null references messaging_private.messages(id) on delete cascade,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (conversation_id, viewer_user_id)
);
create index read_cursors_viewer_idx on messaging_private.read_cursors (viewer_user_id);
create index read_cursors_message_idx on messaging_private.read_cursors (through_message_id);

alter table messaging_private.conversations enable row level security;
alter table messaging_private.messages enable row level security;
alter table messaging_private.read_cursors enable row level security;
revoke all on messaging_private.conversations, messaging_private.messages,
  messaging_private.read_cursors from public, anon, authenticated;
revoke all on sequence messaging_private.messages_id_seq from public, anon, authenticated;
grant select on messaging_private.conversations, messaging_private.messages,
  messaging_private.read_cursors to authenticated;

-- Check the live identity as well as the signed JWT. User-editable metadata is
-- deliberately absent. Deleted, anonymous, unverified, banned and stale-email
-- sessions cannot use the API, even if their old JWT has not expired.
create function messaging_private.actor()
returns table (user_id uuid, email text, is_coach boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id uuid := auth.uid();
  v_email text;
begin
  if v_id is null then
    raise exception 'Sign in to use messaging.' using errcode = '42501';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u
  where u.id = v_id and u.email_confirmed_at is not null
    and u.deleted_at is null
    and coalesce(u.is_anonymous, false) = false
    and (u.banned_until is null or u.banned_until <= now());
  if v_email is null or v_email = '' or
     v_email <> lower(btrim(coalesce(auth.jwt() ->> 'email', ''))) then
    raise exception 'A current verified account is required.' using errcode = '42501';
  end if;
  return query select v_id, v_email, coalesce(public.is_coach_admin(), false);
end;
$$;

create policy conversation_participants_read on messaging_private.conversations
for select to authenticated using (
  exists (select 1 from messaging_private.actor() a
    where a.user_id = client_user_id or a.is_coach)
);
create policy message_participants_read on messaging_private.messages
for select to authenticated using (
  exists (select 1 from messaging_private.conversations c where c.id = conversation_id)
);
create policy own_read_cursor on messaging_private.read_cursors
for select to authenticated using (
  viewer_user_id = (select auth.uid()) and
  exists (select 1 from messaging_private.conversations c where c.id = conversation_id)
);

create function messaging_private.target_email(p_client_email text)
returns text language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_actor record;
  v_requested text := nullif(lower(btrim(p_client_email)), '');
  v_existing text;
begin
  select * into strict v_actor from messaging_private.actor();
  if v_actor.is_coach then
    if v_requested is null then
      raise exception 'Select a client conversation.' using errcode = '22023';
    end if;
    return v_requested;
  end if;
  select c.client_email into v_existing from messaging_private.conversations c
    where c.client_user_id = v_actor.user_id;
  if v_requested is not null and v_requested <> v_actor.email
     and v_requested is distinct from v_existing then
    raise exception 'This conversation is not available.' using errcode = '42501';
  end if;
  return coalesce(v_existing, v_actor.email);
end;
$$;

create function public.messaging_history(
  p_client_email text default null, p_before_id bigint default null, p_limit integer default 50
)
returns table (id bigint, client_email text, sender_user_id uuid,
  sender_role text, body text, created_at timestamptz, request_id uuid)
language plpgsql stable security invoker set search_path = ''
as $$
declare v_email text;
begin
  v_email := messaging_private.target_email(p_client_email);
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_before_id <= 0 then
    raise exception 'Invalid message page.' using errcode = '22023';
  end if;
  return query
    select m.id, c.client_email, m.sender_user_id, m.sender_role, m.body, m.created_at, m.request_id
    from messaging_private.messages m
    join messaging_private.conversations c on c.id = m.conversation_id
    where c.client_email = v_email and (p_before_id is null or m.id < p_before_id)
    order by m.id desc limit p_limit;
end;
$$;

create function public.messaging_inbox(p_limit integer default 100, p_offset integer default 0)
returns table (client_email text, client_name text, last_message_id bigint,
  last_message_body text, last_message_at timestamptz, last_sender_role text, unread_count integer)
language plpgsql stable security invoker set search_path = ''
as $$
declare v_actor record;
begin
  select * into strict v_actor from messaging_private.actor();
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid inbox page.' using errcode = '22023';
  end if;
  return query
    select c.client_email, c.client_name, latest.id, latest.body, latest.created_at,
      latest.sender_role, (select count(*)::integer from messaging_private.messages unread
        where unread.conversation_id = c.id and unread.sender_user_id <> v_actor.user_id
          and unread.id > coalesce(cursor_row.through_message_id, 0))
    from messaging_private.conversations c
    join lateral (select m.id, m.body, m.created_at, m.sender_role
      from messaging_private.messages m where m.conversation_id = c.id
      order by m.id desc limit 1) latest on true
    left join messaging_private.read_cursors cursor_row
      on cursor_row.conversation_id = c.id and cursor_row.viewer_user_id = v_actor.user_id
    order by latest.id desc limit p_limit offset p_offset;
end;
$$;

create function messaging_private.send(p_body text, p_request_id uuid, p_client_email text)
returns table (id bigint, client_email text, sender_user_id uuid,
  sender_role text, body text, created_at timestamptz, request_id uuid)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor record;
  v_email text;
  v_body text := btrim(p_body, E' \t\n\r\f\v' || U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  v_conversation messaging_private.conversations%rowtype;
  v_message messaging_private.messages%rowtype;
  v_name text;
begin
  select * into strict v_actor from messaging_private.actor();
  v_email := messaging_private.target_email(p_client_email);
  if p_request_id is null or v_body is null or char_length(v_body) not between 1 and 4000 then
    raise exception 'Write a message between 1 and 4,000 characters.' using errcode = '22023';
  end if;
  select c.* into v_conversation from messaging_private.conversations c
    where c.client_email = v_email for update;
  if not found then
    if v_actor.is_coach then
      raise exception 'The client has not started this conversation.' using errcode = 'P0002';
    end if;
    select cp.client_name into v_name from public.client_programs cp
      where lower(btrim(cp.client_email)) = v_actor.email and cp.active and not cp.client_archived
      order by cp.updated_at desc limit 1;
    if not found then
      raise exception 'An assigned client program is required.' using errcode = '42501';
    end if;
    insert into messaging_private.conversations (client_user_id, client_email, client_name)
      values (v_actor.user_id, v_actor.email, coalesce(nullif(btrim(v_name), ''), v_actor.email))
      on conflict (client_user_id) do nothing;
    select c.* into strict v_conversation from messaging_private.conversations c
      where c.client_user_id = v_actor.user_id for update;
  end if;
  if not v_actor.is_coach and v_conversation.client_user_id <> v_actor.user_id then
    raise exception 'This conversation is not available.' using errcode = '42501';
  end if;
  -- The row lock is held until commit. Allocate message IDs only after taking
  -- it, so concurrent sends to this conversation cannot commit out of ID order.
  insert into messaging_private.messages (conversation_id, sender_user_id, sender_role, body, request_id)
    values (v_conversation.id, v_actor.user_id, case when v_actor.is_coach then 'coach' else 'client' end,
      v_body, p_request_id)
    on conflict on constraint messages_sender_user_id_request_id_key do nothing
    returning * into v_message;
  if not found then
    select m.* into strict v_message from messaging_private.messages m
      where m.sender_user_id = v_actor.user_id and m.request_id = p_request_id;
    if v_message.conversation_id <> v_conversation.id or v_message.body <> v_body then
      raise exception 'This send request was already used for a different message.' using errcode = '22023';
    end if;
  end if;
  return query select v_message.id, v_conversation.client_email, v_message.sender_user_id,
    v_message.sender_role, v_message.body, v_message.created_at, v_message.request_id;
end;
$$;

create function public.messaging_send(p_body text, p_request_id uuid, p_client_email text default null)
returns table (id bigint, client_email text, sender_user_id uuid,
  sender_role text, body text, created_at timestamptz, request_id uuid)
language sql volatile security invoker set search_path = ''
as $$ select * from messaging_private.send(p_body, p_request_id, p_client_email); $$;

create function messaging_private.mark_read(p_through_message_id bigint, p_client_email text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_actor record;
  v_email text;
  v_conversation messaging_private.conversations%rowtype;
begin
  select * into strict v_actor from messaging_private.actor();
  v_email := messaging_private.target_email(p_client_email);
  select c.* into v_conversation from messaging_private.conversations c
    where c.client_email = v_email for update;
  if not found or (not v_actor.is_coach and v_conversation.client_user_id <> v_actor.user_id) then
    raise exception 'This conversation is not available.' using errcode = '42501';
  end if;
  if p_through_message_id is null or not exists (
    select 1 from messaging_private.messages m
      where m.id = p_through_message_id and m.conversation_id = v_conversation.id
  ) then
    raise exception 'Read through a message in this conversation.' using errcode = '22023';
  end if;
  insert into messaging_private.read_cursors (conversation_id, viewer_user_id, through_message_id)
    values (v_conversation.id, v_actor.user_id, p_through_message_id)
    on conflict (conversation_id, viewer_user_id) do update
      set through_message_id = greatest(messaging_private.read_cursors.through_message_id,
        excluded.through_message_id), updated_at = clock_timestamp();
end;
$$;

create function public.messaging_mark_read(p_through_message_id bigint, p_client_email text default null)
returns void language sql volatile security invoker set search_path = ''
as $$ select messaging_private.mark_read(p_through_message_id, p_client_email); $$;

revoke all on function messaging_private.actor() from public, anon, authenticated;
revoke all on function messaging_private.target_email(text) from public, anon, authenticated;
revoke all on function messaging_private.send(text, uuid, text) from public, anon, authenticated;
revoke all on function messaging_private.mark_read(bigint, text) from public, anon, authenticated;
grant execute on function messaging_private.actor(), messaging_private.target_email(text),
  messaging_private.send(text, uuid, text), messaging_private.mark_read(bigint, text) to authenticated;
revoke all on function public.messaging_history(text, bigint, integer) from public, anon, authenticated;
revoke all on function public.messaging_inbox(integer, integer) from public, anon, authenticated;
revoke all on function public.messaging_send(text, uuid, text) from public, anon, authenticated;
revoke all on function public.messaging_mark_read(bigint, text) from public, anon, authenticated;
grant execute on function public.messaging_history(text, bigint, integer),
  public.messaging_inbox(integer, integer), public.messaging_send(text, uuid, text),
  public.messaging_mark_read(bigint, text) to authenticated;

comment on schema messaging_private is 'Private messaging tables/helpers; do not add to Data API exposed schemas.';
comment on function public.messaging_send(text, uuid, text) is 'Authenticated, idempotent plain-text client/coach send. Sender and role are derived from the verified current identity.';
