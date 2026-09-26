-- Production rollback-only verification. Never invokes cron, pg_net or the
-- Edge worker. Uses synthetic clients; the real coach is only read as recipient
-- metadata inside this uncommitted transaction. No message/email is delivered.
begin;
set transaction isolation level repeatable read;
do $idle$
begin
  assert not exists (select 1 from messaging_private.email_outbox where status in ('pending','leased')),
    'Run rollback claim checks only while the existing queue is empty';
end;
$idle$;
create temp table messaging_email_fixture (
  user_id uuid not null, email text not null, conversation_id uuid not null,
  request_id uuid not null, client_message_id bigint, reply_message_id bigint
);
insert into messaging_email_fixture (user_id, email, conversation_id, request_id)
values (gen_random_uuid(), 'message-email-test-' || gen_random_uuid()::text || '@example.invalid', gen_random_uuid(), gen_random_uuid());
insert into auth.users (id,email,email_confirmed_at,created_at,updated_at)
select user_id,email,now(),now(),now() from messaging_email_fixture;
insert into messaging_private.conversations (id,client_user_id,client_email,client_name)
select conversation_id,user_id,email,'Rollback email recipient' from messaging_email_fixture;

do $test$
declare fixture record; client_message bigint; coach_message bigint; own_message bigint; job record; first_payload jsonb;
begin
  select * into strict fixture from messaging_email_fixture;
  -- Creating these messages as owner is sufficient to exercise the actual
  -- enqueue trigger without changing any real user's session or client program.
  insert into messaging_private.messages (conversation_id,sender_user_id,sender_role,body,request_id)
  values (fixture.conversation_id,fixture.user_id,'client','PRIVATE ROLLBACK CONTENT',fixture.request_id)
  returning id into client_message;
  assert exists (select 1 from messaging_private.email_outbox q
    where q.message_id=client_message and q.recipient_role='coach'
      and q.recipient_email='benjaminbenz.fit@gmail.com'), 'Client message must queue verified coach';
  assert not exists (select 1 from messaging_private.email_outbox q where q.message_id=client_message and q.recipient_user_id=fixture.user_id), 'No sender notification';
  insert into messaging_private.messages (conversation_id,sender_user_id,sender_role,body,request_id)
  values (fixture.conversation_id,gen_random_uuid(),'coach','PRIVATE REPLY CONTENT',gen_random_uuid())
  returning id into coach_message;
  assert exists (select 1 from messaging_private.email_outbox q where q.message_id=coach_message
    and q.recipient_user_id=fixture.user_id and q.recipient_email=fixture.email), 'Coach reply must queue UUID client';
  insert into messaging_private.messages (conversation_id,sender_user_id,sender_role,body,request_id)
  values (fixture.conversation_id,fixture.user_id,'coach','SELF MESSAGE',gen_random_uuid()) returning id into own_message;
  assert not exists (select 1 from messaging_private.email_outbox q where q.message_id=own_message), 'No self email';
  update messaging_email_fixture set client_message_id=client_message,reply_message_id=coach_message;

  -- Repeatable-read snapshot and the idle precondition isolate claim checks
  -- to our uncommitted fixtures. No existing queue rows are modified.
  select * into strict job from public.messaging_claim_email_notifications('FWB Test <no-reply@example.invalid>',1);
  assert job.provider_payload::text not like '%PRIVATE%', 'Provider payload cannot include message text';
  assert job.retry_until-job.first_attempt_at=interval '23 hours', 'Bound provider deduplication window';
  assert public.messaging_validate_email_notification(job.id,job.lease_token), 'Valid lease must be dispatchable';
  first_payload:=job.provider_payload;
  assert public.messaging_retry_email_notification(job.id,job.lease_token,'test_timeout',true,0), 'Retry must persist';
  assert not public.messaging_complete_email_notification(job.id,job.lease_token,'stale-receipt'), 'Old lease cannot ack';
  update messaging_private.email_outbox set next_attempt_at=now()-interval '1 second' where id=job.id;
  -- Claim both fixtures to reach the retried row regardless of created ordering.
  perform public.messaging_claim_email_notifications('Changed Sender <changed@example.invalid>',100);
  assert (select provider_payload=first_payload from messaging_private.email_outbox where id=job.id), 'Retry payload must stay frozen';
  select q.id,q.lease_token into job from messaging_private.email_outbox q where q.message_id=coach_message;
  update auth.users set email='changed-'||fixture.email where id=fixture.user_id;
  assert not public.messaging_validate_email_notification(job.id,job.lease_token), 'Changed recipient must cancel';
  assert (select status='canceled' from messaging_private.email_outbox where id=job.id), 'Canceled recipient is terminal';
  assert not has_function_privilege('anon','public.messaging_claim_email_notifications(text,integer)','execute');
  assert not has_function_privilege('authenticated','public.messaging_email_worker_config()','execute');
  assert not has_table_privilege('authenticated','messaging_private.email_outbox','select');
end;
$test$;
select 'PASS: rollback-only email direction, privacy, frozen retries, leases and changed-recipient checks; no HTTP/email' as result;
rollback;
