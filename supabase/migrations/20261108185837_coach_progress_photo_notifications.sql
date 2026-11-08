-- Notify the coach once a signed-in client has saved a progress-photo record.
-- Keep the private image path and note out of notifications and push payloads.
create schema if not exists fwb_private;
revoke all on schema fwb_private from public, anon, authenticated;

create or replace function fwb_private.notify_coach_progress_photo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  coach_id uuid;
  client_program_id uuid;
  client_name text;
  notification_url text;
  notification_body text;
  notification_dedupe text;
begin
  notification_dedupe := 'coach-progress-photo:' || new.id::text;
  if auth.uid() is null or actor_email <> lower(btrim(new.client_email)) then
    return new;
  end if;

  select u.id into coach_id
    from auth.users as u
   where lower(btrim(u.email)) = 'benjaminbenz.fit@gmail.com'
     and u.deleted_at is null
   order by u.created_at
   limit 1;
  if coach_id is null then return new; end if;

  select p.id, nullif(btrim(p.client_name), '')
    into client_program_id, client_name
    from public.client_programs as p
   where lower(btrim(p.client_email)) = actor_email
     and p.account_type = 'client'
   order by (p.client_archived is not true) desc,
            (p.active is not false) desc,
            p.updated_at desc nulls last, p.created_at desc
   limit 1;

  notification_url := '/coach-admin.html?tab=progress'
    || case when client_program_id is null then '' else '&client=' || client_program_id::text end;
  notification_body := left(coalesce(client_name, 'A client'), 100)
    || ' uploaded a progress photo. Open Coach Admin to view it.';

  -- The hosted project still uses web_* fields. Fresh projects use the
  -- versioned role/action_url/dedupe_key notification contract.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'client_notifications'
       and column_name = 'web_dedupe_key'
  ) then
    insert into public.client_notifications
      (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
    values
      (coach_id, 'progress_submitted', 'Client uploaded a progress photo',
       notification_body, 'progress_submitted', notification_url, notification_dedupe)
    on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing;
  else
    perform private.fwb_queue_notification(
      'benjaminbenz.fit@gmail.com', 'coach', 'progress_submitted',
      'Client uploaded a progress photo', notification_body,
      notification_url, notification_dedupe,
      jsonb_build_object('client_email', new.client_email, 'progress_photo_id', new.id)
    );
  end if;

  return new;
end;
$$;

revoke all on function fwb_private.notify_coach_progress_photo()
  from public, anon, authenticated;

create or replace trigger fwb_notify_coach_progress_photo
after insert on public.client_progress_photos
for each row execute function fwb_private.notify_coach_progress_photo();
