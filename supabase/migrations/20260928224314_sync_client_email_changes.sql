-- Keep client-owned records attached to the same Auth user after a confirmed
-- email change. A conflict (for example, the destination email already owns a
-- program) deliberately aborts the Auth update rather than merging accounts.
create or replace function fwb_private.sync_confirmed_client_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_email text := lower(btrim(coalesce(old.email, '')));
  new_email text := lower(btrim(coalesce(new.email, '')));
begin
  if old_email = '' or new_email = '' or old_email = new_email then
    return new;
  end if;

  -- Core program, training, nutrition, check-in, and progress records.
  update public.client_programs set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_progress set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_workout_logs set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_workout_drafts set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.workout_session_feedback set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_food_logs set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_progress_photos set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_dexa_reports set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_gym_checkins set client_email = new_email
    where lower(btrim(client_email)) = old_email;

  -- Client support and coach-facing history.
  update public.client_progress_notes set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_check_ins set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.coach_requests set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.ai_workout_recommendations set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_fitness_questionnaires set linked_client_email = new_email
    where linked_user_id = new.id
      or lower(btrim(linked_client_email)) = old_email;

  -- Connected devices and imported health records.
  update public.client_fitbit_connections set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_fitbit_activity_syncs set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_google_health_connections set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_google_health_activity_syncs set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_google_health_oauth_states set client_email = new_email
    where lower(btrim(client_email)) = old_email;
  update public.client_google_health_workouts set client_email = new_email
    where owner_user_id = new.id
      or lower(btrim(client_email)) = old_email;
  update public.client_apple_workouts set client_email = new_email
    where owner_user_id = new.id
      or lower(btrim(client_email)) = old_email;
  update public.client_apple_health_settings set client_email = new_email
    where user_id = new.id;
  update public.client_apple_health_workouts set client_email = new_email
    where user_id = new.id;
  update public.client_apple_health_daily set client_email = new_email
    where user_id = new.id;

  -- Private identity mirrors used by messaging and workout deletion.
  update messaging_private.conversations set client_email = new_email
    where client_user_id = new.id;
  update fwb_workout_private.deleted_sessions set client_email = new_email
    where owner_user_id = new.id;

  return new;
end;
$$;

revoke all on function fwb_private.sync_confirmed_client_email_change()
  from public, anon, authenticated, service_role;

drop trigger if exists fwb_sync_confirmed_client_email_change on auth.users;
create trigger fwb_sync_confirmed_client_email_change
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function fwb_private.sync_confirmed_client_email_change();

comment on function fwb_private.sync_confirmed_client_email_change() is
  'Rekeys the explicit allowlist of client-email records after Supabase Auth confirms an account email change.';
