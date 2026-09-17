-- Keep the coach's completed-workout alert enabled across both notification
-- backends while production is being reconciled with the versioned schema.
do $$
declare
  coach_user_id uuid;
begin
  select id
    into coach_user_id
    from auth.users
   where lower(email) = 'benjaminbenz.fit@gmail.com'
     and deleted_at is null
   order by created_at
   limit 1;

  if coach_user_id is null then
    return;
  end if;

  if to_regclass('public.fwb_notification_settings') is not null then
    execute $sql$
      insert into public.fwb_notification_settings (user_id, push_enabled)
      values ($1, true)
      on conflict (user_id) do update
      set push_enabled = true,
          categories = jsonb_set(
            coalesce(public.fwb_notification_settings.categories, '{}'::jsonb),
            '{workout_completed}',
            'true'::jsonb,
            true
          )
    $sql$ using coach_user_id;
  end if;

  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'client_notification_preferences'
       and column_name = 'client_workout_completed'
  ) then
    execute $sql$
      insert into public.client_notification_preferences (
        user_id,
        push_enabled,
        client_workout_completed
      )
      values ($1, true, true)
      on conflict (user_id) do update
      set push_enabled = true,
          client_workout_completed = true,
          updated_at = now()
    $sql$ using coach_user_id;
  end if;
end;
$$;
