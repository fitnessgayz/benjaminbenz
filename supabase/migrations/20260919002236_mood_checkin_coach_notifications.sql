-- A dedicated submission marker distinguishes mood check-ins from measurements.
alter table public.client_progress
  add column if not exists mood_checkin_submitted_at timestamptz;

comment on column public.client_progress.mood_checkin_submitted_at is
  'Set when the client saves the daily mood check-in; unrelated progress edits leave it unchanged.';

create schema if not exists fwb_private;

create or replace function fwb_private.mood_checkin_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  coach_id uuid;
  client_program_id uuid;
  client_name text;
  notification_body text;
  notification_url text;
  dedupe text;
begin
  if auth.uid() is null or actor_email <> lower(btrim(new.client_email))
     or new.mood_checkin_submitted_at is null
     or btrim(coalesce(new.goal_note, '')) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.mood_checkin_submitted_at is not distinct from new.mood_checkin_submitted_at then
    return new;
  end if;

  select id into coach_id from auth.users
   where lower(email) = 'benjaminbenz.fit@gmail.com' and deleted_at is null
   order by created_at limit 1;
  if coach_id is null then return new; end if;

  select p.id, nullif(btrim(p.client_name), '') into client_program_id, client_name
    from public.client_programs p
   where lower(btrim(p.client_email)) = lower(btrim(new.client_email))
   order by (p.client_archived is not true) desc, (p.active is not false) desc,
            p.updated_at desc nulls last, p.created_at desc
   limit 1;
  notification_body := left(coalesce(client_name, 'A client'), 100)
    || ' completed their daily mood check-in. Open Coach Admin to review.';
  notification_url := '/coach-admin.html?tab=progress'
    || case when client_program_id is null then '' else '&client=' || client_program_id::text end;
  dedupe := 'coach-mood:' || md5(lower(btrim(new.client_email))) || ':' || new.entry_date::text;

  -- Use the versioned backend when installed, otherwise the deployed web backend.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'client_notifications'
               and column_name = 'recipient_role') then
    perform private.fwb_queue_notification(
      'benjaminbenz.fit@gmail.com', 'coach', 'check_in_submitted',
      'Mood check-in completed', notification_body, notification_url, dedupe,
      jsonb_build_object('client_email', new.client_email, 'progress_id', new.id, 'check_in_type', 'mood')
    );
  else
    insert into public.client_notifications
      (user_id, kind, title, body, web_category, web_url, web_dedupe_key)
    values
      (coach_id, 'general', 'Mood check-in completed', notification_body,
       'check_in_submitted', notification_url, dedupe)
    on conflict (user_id, web_dedupe_key) where web_dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function fwb_private.mood_checkin_notification() from public, anon, authenticated;

drop trigger if exists fwb_mood_checkin_notifications on public.client_progress;
create trigger fwb_mood_checkin_notifications
after insert or update of mood_checkin_submitted_at on public.client_progress
for each row execute function fwb_private.mood_checkin_notification();

-- Avoid a second, generic progress alert on the versioned backend.
do $migration$
begin
  if to_regprocedure('private.fwb_progress_notification_trigger()') is not null then
    execute $definition$
      create or replace function private.fwb_progress_notification_trigger()
      returns trigger language plpgsql security definer set search_path = '' as $body$
      declare
        actor_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
      begin
        if actor_email <> lower(btrim(new.client_email)) then return new; end if;
        if new.mood_checkin_submitted_at is not null and
           (tg_op = 'INSERT' or old.mood_checkin_submitted_at is distinct from new.mood_checkin_submitted_at) then
          return new;
        end if;
        perform private.fwb_queue_notification(
          'benjaminbenz.fit@gmail.com', 'coach', 'progress_submitted',
          'A client updated progress', 'Open Coach Admin to review the client progress entry.',
          '/coach-admin.html?tab=progress',
          'coach-progress:' || new.id::text || ':' || new.entry_date::text,
          jsonb_build_object('client_email', new.client_email, 'progress_id', new.id)
        );
        return new;
      end;
      $body$;
    $definition$;
  end if;
end;
$migration$;
