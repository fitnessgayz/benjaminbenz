-- Rollback-only production smoke test after applying the messaging migration.
-- No client_programs, real users, existing messages or notification tables are
-- changed. Synthetic Auth users have no subscriptions; messaging has no triggers.
-- Execute the complete file as one transaction with a database owner connection.
begin;
create temp table messaging_test_accounts (
  label text primary key, user_id uuid not null, email text not null,
  conversation_id uuid not null, request_id uuid not null
);
insert into messaging_test_accounts
select label, gen_random_uuid(), 'messaging-test-' || gen_random_uuid()::text || '@example.invalid',
  gen_random_uuid(), gen_random_uuid() from (values ('a'), ('b')) labels(label);
insert into auth.users (id, email, email_confirmed_at, created_at, updated_at)
select user_id, email, now(), now(), now() from messaging_test_accounts;
insert into messaging_private.conversations (id, client_user_id, client_email, client_name)
select conversation_id, user_id, email, 'Rollback messaging fixture ' || label from messaging_test_accounts;
create temp table messaging_test_messages (label text primary key, message_id bigint not null);
grant select on messaging_test_accounts to authenticated;
grant select, insert on messaging_test_messages to authenticated;

set local role authenticated;
do $client_a$
declare account record; first_message record; retried record;
begin
  select * into strict account from messaging_test_accounts where label = 'a';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account.user_id,
    'email', account.email, 'role', 'authenticated')::text, true);
  select * into strict first_message from public.messaging_send('  Rollback hello  ', account.request_id);
  assert first_message.body = 'Rollback hello' and first_message.sender_role = 'client';
  assert first_message.sender_user_id = account.user_id;
  select * into strict retried from public.messaging_send('Rollback hello', account.request_id);
  assert retried.id = first_message.id, 'Retry must return original ID';
  assert (select count(*) from public.messaging_history()) = 1, 'Retry must not duplicate';
  assert (select unread_count from public.messaging_inbox()) = 0, 'Own send is not unread';
  insert into messaging_test_messages values ('a', first_message.id);
  begin
    perform public.messaging_send('Changed body', account.request_id);
    raise exception 'Changed retry was allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.messaging_send(E' \n\t\r', gen_random_uuid());
    raise exception 'Blank body was allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.messaging_send(repeat('x', 4001), gen_random_uuid());
    raise exception 'Oversize body was allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    update messaging_private.messages set body = 'spoofed';
    raise exception 'Direct mutation was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$client_a$;

do $client_b$
declare account record; other_email text; first_message record;
begin
  select * into strict account from messaging_test_accounts where label = 'b';
  select email into other_email from messaging_test_accounts where label = 'a';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account.user_id,
    'email', account.email, 'role', 'authenticated', 'user_metadata',
    jsonb_build_object('role','coach','is_coach',true,'email','benjaminbenz.fit@gmail.com'))::text, true);
  assert (select count(*) from messaging_private.messages) = 0, 'RLS must hide another client';
  assert (select count(*) from public.messaging_inbox()) = 0, 'Inbox cannot leak previews';
  begin
    perform public.messaging_history(other_email);
    raise exception 'Other-client history was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.messaging_send('Spoofed', gen_random_uuid(), other_email);
    raise exception 'Other-client send was allowed';
  exception when insufficient_privilege then null;
  end;
  select * into strict first_message from public.messaging_send('Rollback B', account.request_id);
  assert first_message.sender_role = 'client', 'Metadata cannot grant coach role';
  insert into messaging_test_messages values ('b', first_message.id);
end;
$client_b$;

reset role;
-- Synthetic incoming message provides a read-cursor boundary without signing in
-- as, modifying, or delivering anything to an existing coach account.
insert into messaging_private.messages (conversation_id, sender_user_id, sender_role, body, request_id)
select conversation_id, gen_random_uuid(), 'coach', 'Synthetic rollback reply', gen_random_uuid()
from messaging_test_accounts where label = 'a';
set local role authenticated;
do $cursor$
declare account record; latest_id bigint; older_id bigint; foreign_id bigint;
begin
  select * into strict account from messaging_test_accounts where label = 'a';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', account.user_id,
    'email', account.email, 'role', 'authenticated')::text, true);
  select message_id into older_id from messaging_test_messages where label = 'a';
  select message_id into foreign_id from messaging_test_messages where label = 'b';
  select id into latest_id from public.messaging_history(null,null,1);
  assert (select unread_count from public.messaging_inbox()) = 1, 'Incoming reply must be unread';
  assert (select id from public.messaging_history(null,latest_id,1)) = older_id, 'Exclusive older page';
  perform public.messaging_mark_read(older_id);
  assert (select unread_count from public.messaging_inbox()) = 1, 'Later than displayed stays unread';
  perform public.messaging_mark_read(latest_id);
  assert (select unread_count from public.messaging_inbox()) = 0, 'Visible reply is read';
  perform public.messaging_mark_read(older_id);
  assert (select unread_count from public.messaging_inbox()) = 0, 'Cursor cannot regress';
  begin
    perform public.messaging_mark_read(foreign_id);
    raise exception 'Foreign cursor was allowed';
  exception when invalid_parameter_value then null;
  end;
end;
$cursor$;

reset role;
update auth.users set deleted_at=now()
where id = (select user_id from messaging_test_accounts where label='a');
set local role authenticated;
do $deleted$
begin
  begin
    perform public.messaging_inbox();
    raise exception 'Soft-deleted session was allowed';
  exception when insufficient_privilege then null;
  end;
end;
$deleted$;
reset role;
select 'PASS: synthetic messaging send, retries, isolation, spoofing, pagination, cursors, soft-delete' as result;
rollback;
