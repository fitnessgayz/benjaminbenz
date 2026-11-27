-- Order the existing eligible Discover set by ZIP-area proximity before pagination.
create or replace function spotter_private.discover(p_gender text, p_offset integer) returns jsonb
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
            order by same_zip desc, distance_miles asc nulls last, candidate.user_id
            limit 25 offset greatest(0, least(coalesce(p_offset, 0), 10000))
        ) result
    ), '[]'::jsonb);
end;
$$;
