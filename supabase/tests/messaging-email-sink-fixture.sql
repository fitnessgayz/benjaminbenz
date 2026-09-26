-- ROOT REVIEW REQUIRED. This intentionally commits ONE email job addressed only
-- to Resend's official delivery sink. Do not execute as part of routine tests.
-- Preconditions: migrations and worker deployed; cron job inactive; no other
-- due/leased jobs. Root manually enables worker config and dispatches once.
-- Never insert a client-role message here: that would email the real coach.
begin;
do $check$
begin
  assert not exists (select 1 from cron.job where jobname='fwb-messaging-email-dispatch' and active),
    'Disable automatic dispatch before creating a delivery fixture';
  assert not exists (select 1 from messaging_private.email_outbox where status in ('pending','leased')),
    'Review existing jobs before a manual sink dispatch';
  assert not exists (select 1 from auth.users where lower(email)='delivered+fwb-message-check@resend.dev'),
    'Existing sink identity requires explicit review and cleanup first';
end;
$check$;
with fixture as (
  insert into auth.users (id,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data)
  values (gen_random_uuid(),'delivered+fwb-message-check@resend.dev',now(),now(),now(),
    jsonb_build_object('fwb_internal_fixture','messaging-email-provider-check'))
  returning id,email
), conversation as (
  insert into messaging_private.conversations (client_user_id,client_email,client_name)
  select id,email,'FWB delivery verification' from fixture returning id,client_user_id
), message as (
  insert into messaging_private.messages (conversation_id,sender_user_id,sender_role,body,request_id)
  select id,gen_random_uuid(),'coach','Synthetic delivery check; no real client content.',gen_random_uuid()
    from conversation returning id,conversation_id
)
select conversation.client_user_id as fixture_user_id, message.conversation_id, message.id as fixture_message_id
from message join conversation on conversation.id=message.conversation_id;
commit;
-- After transaction commits, inspect only this intended sink's outbox metadata:
select q.id as delivery_id,q.status,q.recipient_email,q.delivered_at,q.provider_message_id
from messaging_private.email_outbox q join auth.users u on u.id=q.recipient_user_id
where u.email='delivered+fwb-message-check@resend.dev'
  and u.raw_app_meta_data->>'fwb_internal_fixture'='messaging-email-provider-check';
