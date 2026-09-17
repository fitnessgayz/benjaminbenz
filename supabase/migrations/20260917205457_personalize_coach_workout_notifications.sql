-- Name the client and workout in coach completion alerts while retaining the
-- existing completion-only trigger and dedupe key.
create or replace function fwb_private.notify_workout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  client_label text;
  workout_label text;
begin
  if new.completed_at is not null and (tg_op = 'INSERT' or old.completed_at is null) then
    select nullif(btrim(program.client_name), '')
    into client_label
    from public.client_programs as program
    where lower(btrim(program.client_email)) = lower(btrim(new.client_email))
    order by program.active desc, program.updated_at desc nulls last, program.created_at desc
    limit 1;

    client_label := left(
      regexp_replace(
        coalesce(client_label, nullif(split_part(btrim(new.client_email), '@', 1), ''), 'Client'),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      100
    );
    workout_label := nullif(
      left(regexp_replace(btrim(coalesce(new.workout_title, '')), '[[:space:]]+', ' ', 'g'), 120),
      ''
    );

    perform fwb_private.emit(
      'benjaminbenz.fit@gmail.com',
      'workout_completed',
      left(client_label || ' completed a workout', 160),
      coalesce(workout_label || ' is ready to review.', 'Open Coach Admin to review the completed workout log.'),
      'workout:' || lower(new.client_email) || ':' || coalesce(
        new.session_id::text,
        new.workout_session_id::text,
        new.entry_date::text || ':' || new.workout_title
      ),
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function fwb_private.notify_workout() from public, anon, authenticated;
