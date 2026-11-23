-- Conversation state uses existing drafts. Completed sets use the same history
-- rows and pounds-based weight_used column as the existing clients.
alter table public.client_workout_logs
  add column gruntr_exercise_id uuid references public.exercise_library(id) on delete set null,
  add column gruntr_load_unit text check (gruntr_load_unit in ('lb', 'kg')),
  add column gruntr_bodyweight boolean;

create index client_workout_logs_gruntr_exercise_idx
  on public.client_workout_logs (gruntr_exercise_id);

create unique index gruntr_one_chatgpt_workout_per_client
  on public.client_workout_drafts (lower(client_email)) where source = 'gruntr_chatgpt';

-- This contains retry receipts and short-lived routine proposals, not logs.
create table fwb_workout_private.gruntr_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  fingerprint text not null,
  result jsonb,
  proposal jsonb,
  expires_at timestamptz,
  primary key (owner_id, request_id)
);
alter table fwb_workout_private.gruntr_requests enable row level security;
revoke all on fwb_workout_private.gruntr_requests from public, anon, authenticated;
grant select, insert, update on fwb_workout_private.gruntr_requests to authenticated;
create policy gruntr_own_requests on fwb_workout_private.gruntr_requests
  to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create function fwb_workout_private.gruntr_sets_valid(p_sets jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_sets) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_sets) not between 1 and 200 then return false; end if;
  return not exists (
    select 1 from jsonb_to_recordset(p_sets) as s(
      set_id uuid, exercise_id uuid, exercise_name text, exercise_code text, exercise_order int,
      set_number int, reps int, weight_lb numeric, unit text, bodyweight boolean,
      notes text, effort_scale text, effort_value numeric)
    where not coalesce(
      s.set_id is not null and length(btrim(s.exercise_name)) between 1 and 120
      and s.exercise_code ~ '^[A-Z0-9]{1,6}$' and s.exercise_order between 0 and 199
      and s.set_number between 1 and 200 and s.reps between 1 and 1000
      and (s.weight_lb is null or s.weight_lb between 0 and 11024)
      and (s.unit is null or (s.unit in ('lb', 'kg') and s.weight_lb is not null))
      and (s.bodyweight is not true or s.weight_lb is null)
      and length(coalesce(s.notes, '')) <= 500
      and ((s.effort_scale is null and s.effort_value is null)
        or (s.effort_scale = 'rir' and s.effort_value between 0 and 10)
        or (s.effort_scale = 'rpe' and s.effort_value between 1 and 10)), false)
  ) and not exists (
    select 1 from jsonb_to_recordset(p_sets) as s(set_id uuid, exercise_code text, set_number int)
    group by s.set_id having count(*) > 1
  ) and not exists (
    select 1 from jsonb_to_recordset(p_sets) as s(exercise_code text, set_number int)
    group by s.exercise_code, s.set_number having count(*) > 1
  );
end;
$$;
revoke all on function fwb_workout_private.gruntr_sets_valid(jsonb) from public, anon;
grant execute on function fwb_workout_private.gruntr_sets_valid(jsonb) to authenticated;

create function public.write_gruntr_workout(p_request_id uuid, p_action text, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_key uuid := auth.uid();
  email_key text := lower(btrim(coalesce(auth.jwt()->>'email', '')));
  fingerprint_key text := encode(sha256(convert_to(p_action || ':' || p_input::text, 'UTF8')), 'hex');
  prior fwb_workout_private.gruntr_requests%rowtype;
  draft public.client_workout_drafts%rowtype;
  session_key uuid := (p_input->>'session_id')::uuid;
  set_key uuid;
  exercise_key uuid;
  exercise_name_value text;
  entry_day date;
  title text;
  gym text;
  base_title text;
  attempt integer := 1;
  workout_sets jsonb;
  previous_set jsonb;
  new_set jsonb;
  set_position integer;
  set_order integer;
  set_number_value integer;
  exercise_code_value text;
  saved jsonb;
begin
  if owner_key is null or email_key = '' then
    raise exception 'Sign in to GRUNTR.' using errcode = '42501';
  end if;
  if p_request_id is null or p_action is null or p_action not in ('start','append','edit','finish','complete','cancel')
     or jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text) > 280000 then
    raise exception 'Invalid workout request.' using errcode = '22023';
  end if;

  -- Workouts are serialized per signed-in email, including title allocation.
  perform pg_advisory_xact_lock(hashtextextended('gruntr:' || email_key, 0));
  select * into prior from fwb_workout_private.gruntr_requests
    where owner_id = owner_key and request_id = p_request_id;
  if found then
    if fingerprint_key <> prior.fingerprint then
      raise exception 'Use a new request ID for changed details.' using errcode = '22023';
    end if;
    return prior.result || jsonb_build_object('replayed', true);
  end if;

  if p_action in ('start', 'complete') then
    entry_day := (p_input->>'occurred_on')::date;
    title := btrim(p_input->>'workout_title');
    gym := nullif(btrim(p_input->>'gym_name'), '');
    if entry_day is null or entry_day not between date '1900-01-01' and current_date + 1
       or title is null or length(title) not between 1 and 120 or length(gym) > 120 then
      raise exception 'Provide a valid local workout date and title.' using errcode = '22023';
    end if;
    session_key := gen_random_uuid();
    workout_sets := '[]'::jsonb;
  else
    select * into draft from public.client_workout_drafts
      where session_id = session_key and lower(client_email) = email_key and source = 'gruntr_chatgpt'
      for update;
    if not found then
      raise exception 'That ChatGPT workout is no longer active.' using errcode = '22023';
    end if;
    entry_day := draft.entry_date;
    title := draft.workout_title;
    gym := draft.snapshot->>'gym_name';
    workout_sets := draft.snapshot->'sets';
  end if;

  if p_action = 'start' then
    if exists (select 1 from public.client_workout_drafts
      where lower(client_email) = email_key and source = 'gruntr_chatgpt') then
      raise exception 'You already have an active ChatGPT workout. Open it first.' using errcode = '22023';
    end if;
    insert into public.client_workout_drafts (session_id, client_email, workout_key, entry_date,
        workout_title, snapshot, source, client_updated_at)
      values (session_key, email_key, 'gruntr_chatgpt:' || session_key::text, entry_day, title,
        jsonb_build_object('sets', workout_sets, 'gym_name', gym), 'gruntr_chatgpt', now())
      returning jsonb_build_object('state', 'active', 'session_id', session_id,
        'occurred_on', entry_date, 'workout_title', workout_title) into saved;

  elsif p_action = 'cancel' then
    if workout_sets <> '[]'::jsonb then
      raise exception 'Only an empty ChatGPT workout can be canceled here.' using errcode = '22023';
    end if;
    delete from public.client_workout_drafts where session_id = session_key and lower(client_email) = email_key
      returning jsonb_build_object('state', 'canceled', 'session_id', session_id) into saved;

  elsif p_action in ('append', 'edit') then
    new_set := p_input->'set';
    if jsonb_typeof(new_set) is distinct from 'object' then
      raise exception 'Provide a performed set.' using errcode = '22023';
    end if;
    if p_action = 'append' then
      exercise_key := (new_set->>'exercise_id')::uuid;
      exercise_name_value := new_set->>'exercise_name';
      select (s->>'exercise_order')::int, s->>'exercise_code' into set_order, exercise_code_value
        from jsonb_array_elements(workout_sets) as s
        where case when exercise_key is not null then (s->>'exercise_id')::uuid = exercise_key
          else (s->>'exercise_id') is null and lower(s->>'exercise_name') = lower(exercise_name_value) end
        limit 1;
      if not found then
        select coalesce(max((s->>'exercise_order')::int), -1) + 1 into set_order
          from jsonb_array_elements(workout_sets) as s;
        exercise_code_value := 'E' || (set_order + 1);
      end if;
      select coalesce(max((s->>'set_number')::int), 0) + 1 into set_number_value
        from jsonb_array_elements(workout_sets) as s where s->>'exercise_code' = exercise_code_value;
      set_key := gen_random_uuid();
      new_set := new_set || jsonb_build_object('set_id', set_key, 'exercise_code', exercise_code_value,
        'exercise_order', set_order, 'set_number', set_number_value);
      workout_sets := workout_sets || jsonb_build_array(new_set);
    else
      set_key := (p_input->>'set_id')::uuid;
      select s.value, s.ordinality::integer - 1 into previous_set, set_position
        from jsonb_array_elements(workout_sets) with ordinality as s(value, ordinality)
        where (s.value->>'set_id')::uuid = set_key;
      if not found then raise exception 'Set not found in this workout.' using errcode = '22023'; end if;
      new_set := previous_set || (new_set - array['set_id','exercise_id','exercise_name',
        'exercise_code','exercise_order','set_number']);
      workout_sets := jsonb_set(workout_sets, array[set_position::text], new_set);
    end if;
    if not fwb_workout_private.gruntr_sets_valid(workout_sets) then
      raise exception 'Invalid set details or workout set limit exceeded.' using errcode = '22023';
    end if;
    update public.client_workout_drafts
      set snapshot = jsonb_set(snapshot, '{sets}', workout_sets), client_updated_at = now()
      where session_id = session_key and lower(client_email) = email_key
      returning jsonb_build_object('state', 'active', 'session_id', session_id, 'set_id', set_key,
        'set_number', (new_set->>'set_number')::int) into saved;

  else
    if p_action = 'complete' then
      if jsonb_typeof(p_input->'sets') is distinct from 'array' then
        raise exception 'Provide the completed sets.' using errcode = '22023';
      end if;
      select jsonb_agg(s || jsonb_build_object('set_id', gen_random_uuid()) order by ordinality)
        into workout_sets from jsonb_array_elements(p_input->'sets') with ordinality as items(s, ordinality);
    end if;
    if not fwb_workout_private.gruntr_sets_valid(workout_sets) then
      raise exception 'Provide valid completed sets before finishing.' using errcode = '22023';
    end if;
    base_title := title;
    while exists (select 1 from public.client_workout_logs l
        where l.client_email = email_key and l.entry_date = entry_day
          and lower(l.workout_title) = lower(title)) loop
      attempt := attempt + 1;
      title := left(base_title, 110) || ' (' || attempt || ')';
    end loop;

    with inserted as (
      insert into public.client_workout_logs (
        client_email, session_id, workout_session_id, set_id, entry_date, workout_title,
        exercise_code, exercise_name, exercise_order, set_number, reps, weight_used, notes, gym_name,
        effort_scale, effort_value, gruntr_exercise_id, gruntr_load_unit, gruntr_bodyweight,
        source, source_version, client_updated_at, completed_at)
      select email_key, session_key, session_key, s.set_id, entry_day, title,
        s.exercise_code, s.exercise_name, s.exercise_order, s.set_number, s.reps, coalesce(s.weight_lb, 0),
        case when s.bodyweight then concat_ws(' · ', 'Bodyweight', s.notes) else s.notes end, gym, s.effort_scale, s.effort_value, s.exercise_id, s.unit, coalesce(s.bodyweight, false),
        case when p_action = 'complete' then 'mcp' else 'gruntr_chatgpt' end, 1, now(), now()
      from jsonb_to_recordset(workout_sets) as s(
        set_id uuid, exercise_id uuid, exercise_name text, exercise_code text, exercise_order int,
        set_number int, reps int, weight_lb numeric, unit text, bodyweight boolean,
        notes text, effort_scale text, effort_value numeric)
      order by s.exercise_order, s.set_number
      returning id, set_id, exercise_order, set_number
    ) select jsonb_build_object('state', 'completed', 'session_id', session_key,
      'date', entry_day, 'title', title, 'sets', count(*), 'set_ids',
      jsonb_agg(jsonb_build_object('id', id, 'set_id', set_id) order by exercise_order, set_number))
      into saved from inserted;
    if p_action = 'finish' then
      delete from public.client_workout_drafts where session_id = session_key and lower(client_email) = email_key;
    end if;
  end if;

  insert into fwb_workout_private.gruntr_requests(owner_id, request_id, fingerprint, result)
    values (owner_key, p_request_id, fingerprint_key, saved);
  return saved;
end;
$$;
revoke all on function public.write_gruntr_workout(uuid, text, jsonb) from public, anon;
grant execute on function public.write_gruntr_workout(uuid, text, jsonb) to authenticated;

create function public.propose_gruntr_routine(p_request_id uuid, p_plan jsonb, p_plan_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_key uuid := auth.uid();
  fingerprint_key text := encode(sha256(convert_to(jsonb_build_array('routine', p_plan_id, p_plan)::text, 'UTF8')), 'hex');
  prior fwb_workout_private.gruntr_requests%rowtype;
  existing public.client_saved_workout_plans%rowtype;
  draft_result jsonb;
  deadline timestamptz := now() + interval '30 minutes';
begin
  if owner_key is null then raise exception 'Sign in to GRUNTR.' using errcode = '42501'; end if;
  if p_request_id is null or jsonb_typeof(p_plan) is distinct from 'object'
     or octet_length(p_plan::text) > 64000 or not coalesce(
     p_plan->>'source' = 'gruntr_chatgpt' and p_plan->>'version' = '1'
     and length(btrim(p_plan->>'title')) between 1 and 120
     and jsonb_typeof(p_plan->'workouts') = 'array' and jsonb_typeof(p_plan->'sessions') = 'array', false) then
    raise exception 'Invalid routine preview.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_plan->'workouts') not between 2 and 5
     or jsonb_array_length(p_plan->'workouts') <> jsonb_array_length(p_plan->'sessions') then
    raise exception 'A routine needs two to five workouts.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gruntr-routines:' || owner_key::text, 0));
  select * into prior from fwb_workout_private.gruntr_requests
    where owner_id = owner_key and request_id = p_request_id;
  if found then
    if prior.fingerprint <> fingerprint_key then
      raise exception 'Use a new request ID for changed details.' using errcode = '22023';
    end if;
    return case when prior.result->>'state' = 'saved' then prior.result
      when prior.expires_at <= now() then jsonb_build_object('state', 'expired', 'proposal_id', p_request_id)
      else prior.result || jsonb_build_object('before', prior.proposal->'previous_workouts',
        'after', prior.proposal->'plan'->'workouts') end;
  end if;
  if p_plan_id is not null then
    select * into existing from public.client_saved_workout_plans
      where id = p_plan_id and user_id = owner_key and not is_deleted;
    if not found or existing.plan->>'source' = 'fitness-plan'
       or jsonb_typeof(existing.plan->'workouts') is distinct from 'array' then
      raise exception 'Choose a saved weekly routine that GRUNTR can update.' using errcode = '22023';
    end if;
  end if;
  update fwb_workout_private.gruntr_requests set proposal = null
    where owner_id = owner_key and expires_at <= now() and proposal is not null;
  draft_result := jsonb_build_object('state', 'awaiting_approval', 'proposal_id', p_request_id,
    'expires_at', deadline, 'before', existing.plan->'workouts',
    'previous_title', existing.title, 'title', p_plan->>'title', 'after', p_plan->'workouts');
  insert into fwb_workout_private.gruntr_requests(owner_id, request_id, fingerprint, result, proposal, expires_at)
    values (owner_key, p_request_id, fingerprint_key, draft_result - 'before' - 'after',
      jsonb_build_object('plan', p_plan, 'plan_id', p_plan_id,
        'previous_workouts', existing.plan->'workouts', 'updated_at', existing.updated_at), deadline);
  return draft_result;
end;
$$;

create function public.get_gruntr_routine_proposal(p_proposal_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select case
    when r.result->>'state' = 'saved' then r.result
    when r.expires_at <= now() then jsonb_build_object('state', 'expired', 'proposal_id', r.request_id)
    else r.result || jsonb_build_object('before', r.proposal->'previous_workouts', 'after', r.proposal->'plan'->'workouts')
  end
  from fwb_workout_private.gruntr_requests r
  where r.owner_id = (select auth.uid()) and r.request_id = p_proposal_id and r.expires_at is not null
$$;

create function public.approve_gruntr_routine(p_proposal_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_key uuid := auth.uid();
  preview fwb_workout_private.gruntr_requests%rowtype;
  plan_key uuid;
  native_plan jsonb;
  original_plan_key uuid;
  saved jsonb;
begin
  -- Supabase third-party OAuth access tokens carry client_id. Approval is
  -- performed by the user in the existing first-party GRUNTR dashboard.
  if owner_key is null or auth.jwt()->>'client_id' is not null
     or nullif(auth.jwt()->>'email', '') is null then
    raise exception 'Approve this routine from your GRUNTR dashboard.' using errcode = '42501';
  end if;
  select * into preview from fwb_workout_private.gruntr_requests
    where owner_id = owner_key and request_id = p_proposal_id and expires_at is not null for update;
  if not found then raise exception 'Routine preview not found.' using errcode = '22023'; end if;
  if preview.result->>'state' = 'saved' then return preview.result; end if;
  if preview.expires_at <= now() or preview.proposal is null then
    raise exception 'Routine preview expired. Request a fresh preview.' using errcode = '22023';
  end if;
  original_plan_key := (preview.proposal->>'plan_id')::uuid;
  plan_key := coalesce(original_plan_key, gen_random_uuid());
  -- Swift Codable stores Date as seconds from 2001-01-01.
  native_plan := preview.proposal->'plan' || jsonb_build_object('id', plan_key,
    'createdAt', extract(epoch from now()) - 978307200);
  native_plan := jsonb_set(native_plan, '{sessions}', (
    select jsonb_agg(jsonb_set(s, '{launch,createdAt}', native_plan->'createdAt') order by ordinality)
    from jsonb_array_elements(native_plan->'sessions') with ordinality as entries(s, ordinality)
  ));
  if original_plan_key is null then
    insert into public.client_saved_workout_plans(id, user_id, title, plan, snapshot_json, plan_kind)
    values (plan_key, owner_key, native_plan->>'title', native_plan, native_plan::text, 'program')
    returning id into plan_key;
  else
    update public.client_saved_workout_plans set title = native_plan->>'title', plan = native_plan,
      snapshot_json = native_plan::text, plan_kind = 'program'
    where id = plan_key and user_id = owner_key and not is_deleted
      and updated_at = (preview.proposal->>'updated_at')::timestamptz
    returning id into plan_key;
    if not found then
      raise exception 'The saved routine changed. Request a fresh preview.' using errcode = '22023';
    end if;
  end if;
  saved := jsonb_build_object('state', 'saved', 'proposal_id', p_proposal_id,
    'plan_id', plan_key, 'title', native_plan->>'title');
  update fwb_workout_private.gruntr_requests set proposal = null, result = saved
    where owner_id = owner_key and request_id = p_proposal_id;
  return saved;
end;
$$;

revoke all on function public.propose_gruntr_routine(uuid, jsonb, uuid),
  public.get_gruntr_routine_proposal(uuid), public.approve_gruntr_routine(uuid) from public, anon;
grant execute on function public.propose_gruntr_routine(uuid, jsonb, uuid),
  public.get_gruntr_routine_proposal(uuid), public.approve_gruntr_routine(uuid) to authenticated;
