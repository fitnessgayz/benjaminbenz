-- Run after inspecting the sink delivery receipt. Deletes only the tagged
-- synthetic Auth identity; FK cascades remove its private conversation and job.
-- Preserve this exact email+trusted marker guard. Do not broaden the predicate.
begin;
delete from auth.users
where email='delivered+fwb-message-check@resend.dev'
  and raw_app_meta_data->>'fwb_internal_fixture'='messaging-email-provider-check';
commit;
select count(*) as remaining_fixture_users from auth.users
where email='delivered+fwb-message-check@resend.dev'
  and raw_app_meta_data->>'fwb_internal_fixture'='messaging-email-provider-check';
select count(*) as remaining_fixture_jobs from messaging_private.email_outbox
where recipient_email='delivered+fwb-message-check@resend.dev';
