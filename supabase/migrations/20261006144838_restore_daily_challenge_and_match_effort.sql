-- Restore an existing daily pick without assigning one, and keep workout-day picks in the training pool.
create or replace function community_private.community_daily_challenge(
  p_local_day date, p_action text default 'draw', p_training_day boolean default false
) returns table (challenge_date date, slug text, title text, instruction text, category text,
  effort text, completion_kind text, training_day boolean, rerolls_used smallint, completed boolean)
language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); existing community_private.daily_challenge_assignments%rowtype; chosen text;
begin
  if actor is null or (select public.is_coach_admin()) then raise exception 'Sign in as a client'; end if;
  if p_local_day is null or p_local_day < current_date - 1 or p_local_day > current_date + 1 then
    raise exception 'Choose your current local day';
  end if;
  if p_action not in ('draw', 'reroll', 'peek') then raise exception 'Invalid action'; end if;
  if not exists (select 1 from public.client_community_profiles where user_id = actor) then
    raise exception 'Join Community before drawing a challenge';
  end if;
  -- Serialize concurrent taps; the assignment remains stable for the day.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || p_local_day::text, 0));
  select * into existing from community_private.daily_challenge_assignments a
    where a.user_id = actor and a.challenge_date = p_local_day for update;
  if p_action <> 'peek' and (existing.user_id is null or (p_action = 'reroll' and existing.rerolls_used = 0
      and community_private.daily_challenge_completion(actor, p_local_day,
        (select c.completion_kind from community_private.daily_challenge_catalog c where c.slug = existing.challenge_slug),
        existing.completed_at) is null)) then
    select c.slug into chosen from community_private.daily_challenge_catalog c
      where c.effort = case when coalesce(p_training_day, false) then 'training' else 'easy' end
        and (existing.user_id is null or c.slug <> existing.challenge_slug)
        and not exists (select 1 from community_private.daily_challenge_assignments prior
          where prior.user_id = actor and prior.challenge_slug = c.slug
            and prior.challenge_date >= p_local_day - case when coalesce(p_training_day, false) then 7 else 14 end and prior.challenge_date < p_local_day)
      order by random() limit 1;
    if chosen is null then raise exception 'No challenge available'; end if;
    if existing.user_id is null then
      insert into community_private.daily_challenge_assignments(user_id,challenge_date,challenge_slug,training_day)
        values(actor,p_local_day,chosen,coalesce(p_training_day,false));
    else
      update community_private.daily_challenge_assignments a
        set challenge_slug = chosen, rerolls_used = 1, training_day = coalesce(p_training_day,false)
        where a.user_id = actor and a.challenge_date = p_local_day;
    end if;
  end if;
  return query select a.challenge_date,c.slug,c.title,c.instruction,c.category,c.effort,c.completion_kind,a.training_day,
    a.rerolls_used,
    community_private.daily_challenge_completion(actor,a.challenge_date,c.completion_kind,a.completed_at) is not null
    from community_private.daily_challenge_assignments a
    join community_private.daily_challenge_catalog c on c.slug = a.challenge_slug
    where a.user_id = actor and a.challenge_date = p_local_day;
end;
$$;
