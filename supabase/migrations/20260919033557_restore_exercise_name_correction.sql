-- Restore the correction RPC that was present in source but absent in production.
-- Keep the migration history self-contained: the legacy production setup added
-- this policy outside the ordered migrations, while the Coach Admin browser
-- needs it to load the selected client's saved custom-workout names.
drop policy if exists "Coach admins can read all workout logs" on public.client_workout_logs;
create policy "Coach admins can read all workout logs"
on public.client_workout_logs
for select
to authenticated
using ((select public.is_coach_admin()));

create or replace function public.correct_client_exercise_name(
  target_client_email text,
  previous_exercise_name text,
  corrected_exercise_name text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(coalesce(target_client_email, '')));
  normalized_previous_name text := lower(regexp_replace(btrim(coalesce(previous_exercise_name, '')), '[[:space:]]+', ' ', 'g'));
  cleaned_corrected_name text := regexp_replace(btrim(coalesce(corrected_exercise_name, '')), '[[:space:]]+', ' ', 'g');
  affected_rows integer := 0;
begin
  if normalized_email = '' then
    raise exception 'A client email is required.' using errcode = '22023';
  end if;

  if char_length(normalized_previous_name) < 2 or char_length(normalized_previous_name) > 120 then
    raise exception 'Choose a valid exercise name to correct.' using errcode = '22023';
  end if;

  if char_length(cleaned_corrected_name) < 2 or char_length(cleaned_corrected_name) > 120 then
    raise exception 'The corrected exercise name must be between 2 and 120 characters.' using errcode = '22023';
  end if;

  if not (
    normalized_email = lower(coalesce((select auth.jwt()) ->> 'email', ''))
    or (select public.is_coach_admin())
  ) then
    raise exception 'You cannot correct exercise names for this client.' using errcode = '42501';
  end if;

  update public.client_workout_logs
  set
    original_exercise_name = coalesce(original_exercise_name, exercise_name),
    exercise_name = cleaned_corrected_name
  where lower(btrim(client_email)) = normalized_email
    and lower(regexp_replace(btrim(exercise_name), '[[:space:]]+', ' ', 'g')) = normalized_previous_name
    and upper(btrim(coalesce(exercise_code, ''))) not in ('WARMUP', 'CARDIO')
    and exercise_name is distinct from cleaned_corrected_name;

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

comment on function public.correct_client_exercise_name(text, text, text) is
  'Corrects one client exercise label across saved workout sets while retaining the first entered label in original_exercise_name.';

revoke all on function public.correct_client_exercise_name(text, text, text) from public;
revoke all on function public.correct_client_exercise_name(text, text, text) from anon;
grant execute on function public.correct_client_exercise_name(text, text, text) to authenticated;


notify pgrst, 'reload schema';
