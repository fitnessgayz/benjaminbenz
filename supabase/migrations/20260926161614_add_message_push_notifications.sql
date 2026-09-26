-- Queue a generic in-app/web-push notification for each newly inserted chat
-- message. Email delivery remains independently disabled.

create or replace function messaging_private.enqueue_message_notification_row(
  p_user_id uuid,
  p_recipient_role text,
  p_kind text,
  p_title text,
  p_body text,
  p_web_category text,
  p_action_url text,
  p_dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  -- The deployed notification backend uses the web_* compatibility columns.
  -- The alternate branch supports the newer schema in a fresh environment.
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'client_notifications'
       and column_name = 'web_category'
  ) then
    execute $insert$
      insert into public.client_notifications
        (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (user_id, web_dedupe_key)
        where web_dedupe_key is not null do nothing
    $insert$
    using p_user_id, p_kind, p_title, p_body, p_web_category,
      p_action_url, p_dedupe_key;
  else
    execute $insert$
      insert into public.client_notifications
        (user_id, recipient_role, kind, title, body, action_url, dedupe_key, metadata)
      values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (user_id, dedupe_key)
        where dedupe_key is not null do nothing
    $insert$
    using p_user_id, p_recipient_role, p_kind, p_title, p_body,
      p_action_url, p_dedupe_key,
      jsonb_build_object('category', p_web_category, 'source', 'coach_message');
  end if;
end;
$$;

create or replace function messaging_private.enqueue_message_push_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread messaging_private.conversations%rowtype;
  recipient record;
  recipient_role text;
  notification_kind text;
  notification_title text;
  notification_category text;
  destination text;
begin
  select conversation.*
    into strict thread
    from messaging_private.conversations as conversation
   where conversation.id = new.conversation_id;

  if new.sender_role = 'client' then
    recipient_role := 'coach';
    notification_kind := 'general';
    notification_title := 'New client message';
    notification_category := 'client_message';
    destination := '/coach-admin.html?tab=inbox';
  else
    recipient_role := 'client';
    notification_kind := 'coach_reply';
    notification_title := 'New message from your coach';
    notification_category := 'coach_reply';
    destination := '/client-dashboard.html?messages=1';
  end if;

  for recipient in
    select account.id
      from auth.users as account
     where account.id <> new.sender_user_id
       and account.email_confirmed_at is not null
       and account.deleted_at is null
       and not coalesce(account.is_anonymous, false)
       and (account.banned_until is null or account.banned_until <= now())
       and (
         (new.sender_role = 'client'
           and lower(btrim(account.email)) = 'benjaminbenz.fit@gmail.com')
         or
         (new.sender_role = 'coach'
           and account.id = thread.client_user_id)
       )
  loop
    perform messaging_private.enqueue_message_notification_row(
      recipient.id,
      recipient_role,
      notification_kind,
      notification_title,
      'Open FWB Training to read and reply.',
      notification_category,
      destination,
      'coach-message:' || new.id::text || ':' || recipient.id::text
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists message_push_notification on messaging_private.messages;
create trigger message_push_notification
  after insert on messaging_private.messages
  for each row execute function messaging_private.enqueue_message_push_notification();

revoke all on function messaging_private.enqueue_message_notification_row(
  uuid, text, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function messaging_private.enqueue_message_push_notification()
  from public, anon, authenticated;
