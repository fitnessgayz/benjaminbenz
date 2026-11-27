-- Share the same eligible set and ordering across both Discover endpoints.
create function spotter_private.discover_matches(
    p_gender text, p_photos_only boolean, p_gym text, p_goals text[],
    p_days text[], p_periods text[], p_offset integer
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
begin
    return coalesce((
        select jsonb_agg(
            spotter_private.profile_payload(result.profile, false)
            order by result.same_zip desc, result.distance_miles asc nulls last, result.user_id
        )
        from (
            select candidate as profile, candidate.user_id,
                own.zip = candidate.zip as same_zip,
                case when origin.zip is not null and destination.zip is not null then
                    3958.8 * acos(greatest(-1.0, least(1.0,
                        sin(radians(origin.latitude)) * sin(radians(destination.latitude))
                        + cos(radians(origin.latitude)) * cos(radians(destination.latitude))
                            * cos(radians(destination.longitude - origin.longitude))
                    )))
                end as distance_miles
            from spotter_private.profiles own
            join spotter_private.profiles candidate on candidate.active and candidate.user_id <> own.user_id
            left join spotter_private.zip_centroids origin on origin.zip = own.zip
            left join spotter_private.zip_centroids destination on destination.zip = candidate.zip
            left join spotter_private.profile_details details on details.member_id = candidate.user_id
                and (p_gym is not null or cardinality(p_days) > 0 or cardinality(p_periods) > 0)
            where own.user_id = actor and (p_gender is null or candidate.gender = p_gender)
                and spotter_private.same_area(own, candidate)
                and spotter_private.profile_is_visible(candidate.user_id)
                and not community_private.actors_are_blocked(actor, candidate.user_id)
                and not exists (
                    select 1 from spotter_private.connections connection
                    where least(connection.sender_id, connection.recipient_id) = least(actor, candidate.user_id)
                      and greatest(connection.sender_id, connection.recipient_id) = greatest(actor, candidate.user_id)
                      and (connection.status <> 'declined' or connection.updated_at > now() - interval '30 days')
                )
                and (not p_photos_only or spotter_private.profile_payload(candidate, false) ? 'portrait_path')
                and (cardinality(p_goals) = 0 or candidate.preferences -> 'goals' ?| p_goals)
                and (p_gym is null or (details.share_gyms and exists (
                    select 1 from jsonb_array_elements_text(details.gym_names) as gym(name)
                    where lower(btrim(gym.name)) = p_gym
                )))
                and (
                    (cardinality(p_days) = 0 and cardinality(p_periods) = 0)
                    or exists (
                        select 1 from jsonb_array_elements(details.availability_schedule) as schedule(slot)
                        where (cardinality(p_days) = 0 or slot ->> 'day' = any(p_days))
                          and (cardinality(p_periods) = 0 or slot -> 'periods' ?| p_periods)
                    )
                    -- The old weekday/weekend labels imply dayparts, without an exact weekday.
                    or (cardinality(p_days) = 0
                        and coalesce(jsonb_array_length(details.availability_schedule), 0) = 0
                        and exists (
                            select 1 from unnest(p_periods) as daypart(period)
                            where candidate.preferences -> 'availability' ?| array[
                                'Weekday ' || period || 's', 'Weekend ' || period || 's'
                            ]
                        ))
                )
            order by same_zip desc, distance_miles asc nulls last, candidate.user_id
            limit 25 offset greatest(0, least(coalesce(p_offset, 0), 10000))
        ) result
    ), '[]'::jsonb);
end;
$$;

create or replace function spotter_private.discover(p_gender text, p_offset integer) returns jsonb
language sql stable security definer set search_path = '' as $$
    select spotter_private.discover_matches(p_gender, false, null, '{}', '{}', '{}', p_offset);
$$;

create function public.spotter_discover_filtered(p_filters jsonb, p_offset integer default 0) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
    filters record;
begin
    if p_filters is null or p_filters = 'null'::jsonb then p_filters := '{}'::jsonb; end if;
    if jsonb_typeof(p_filters) <> 'object' then
        raise exception 'Choose valid Spotter filters.' using errcode = '22023';
    end if;

    if exists (
        select 1 from jsonb_each(p_filters) as entry(key, value)
        join (values ('gender', 'string'), ('photos_only', 'boolean'), ('gym', 'string'),
            ('goals', 'array'), ('days', 'array'), ('periods', 'array')) as expected(key, kind) using (key)
        where jsonb_typeof(entry.value) not in ('null', expected.kind)
    ) then
        raise exception 'Choose valid Spotter filters.' using errcode = '22023';
    end if;

    select * into filters from jsonb_to_record(p_filters) as input(
        gender text, photos_only boolean, gym text, goals text[], days text[], periods text[]
    );
    if filters.gender not in ('woman', 'man', 'nonbinary')
        or char_length(btrim(filters.gym)) > 80
        or cardinality(filters.goals) > 6
        or not (filters.days <@ array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
        or not (filters.periods <@ array['morning', 'afternoon', 'evening']) then
        raise exception 'Choose valid Spotter filters.' using errcode = '22023';
    end if;

    return spotter_private.discover_matches(
        filters.gender, coalesce(filters.photos_only, false), nullif(lower(btrim(filters.gym)), ''),
        coalesce(filters.goals, '{}'), coalesce(filters.days, '{}'), coalesce(filters.periods, '{}'), p_offset
    );
end;
$$;

revoke execute on function spotter_private.discover_matches(text, boolean, text, text[], text[], text[], integer),
    public.spotter_discover_filtered(jsonb, integer) from public, anon, authenticated;
grant execute on function spotter_private.discover_matches(text, boolean, text, text[], text[], text[], integer),
    public.spotter_discover_filtered(jsonb, integer) to authenticated;
