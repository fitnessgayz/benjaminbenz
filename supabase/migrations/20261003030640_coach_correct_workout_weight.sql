-- Correct one saved set in place so web/iOS PR calculations use the real weight.
-- The caller's coach role and existing workout-log RLS remain authoritative.
create function public.coach_correct_workout_weight(
  p_log_id uuid,
  p_client_email text,
  p_weight numeric,
  p_expected_updated_at timestamptz
) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  changed integer;
begin
  if auth.uid() is null or not public.is_coach_admin() then
    raise exception 'Only a signed-in coach can correct a client workout.' using errcode = '42501';
  end if;
  if p_weight is null or p_weight < 0 or p_weight::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Enter a valid weight of zero or more.' using errcode = '22023';
  end if;
  if p_log_id is null or nullif(btrim(p_client_email), '') is null or p_expected_updated_at is null then
    raise exception 'Refresh the workout history before correcting this set.' using errcode = '22023';
  end if;
  update public.client_workout_logs
  set weight_used = p_weight
  where id = p_log_id
    and lower(btrim(client_email)) = lower(btrim(p_client_email))
    and updated_at = p_expected_updated_at
    and exercise_code not in ('CARDIO', 'WARMUP');
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'This set changed or could not be found. Refresh workout history and try again.' using errcode = '40001';
  end if;
  return changed;
end;
$$;
revoke all on function public.coach_correct_workout_weight(uuid,text,numeric,timestamptz) from public, anon;
grant execute on function public.coach_correct_workout_weight(uuid,text,numeric,timestamptz) to authenticated;
