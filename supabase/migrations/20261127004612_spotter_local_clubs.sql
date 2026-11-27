create table spotter_private.local_club_memberships (
    member_id uuid not null references spotter_private.profiles(user_id) on delete cascade,
    club_id text not null check (club_id in ('running', 'pickleball', 'volleyball', 'tennis', 'hiking', 'cycling')),
    training_zip text not null,
    primary key (member_id, club_id)
);

create index spotter_local_club_memberships_by_area
    on spotter_private.local_club_memberships (training_zip, club_id, member_id);

alter table spotter_private.local_club_memberships enable row level security;
revoke all on spotter_private.local_club_memberships from public, anon, authenticated;

-- Membership is an explicit choice for the current training area.
create function spotter_private.reset_clubs_when_training_zip_changes() returns trigger
language plpgsql set search_path = '' as $$
begin
    delete from spotter_private.local_club_memberships where member_id = new.user_id;
    return new;
end;
$$;

create trigger spotter_reset_clubs_on_training_zip_change
    after update of zip on spotter_private.profiles
    for each row when (old.zip is distinct from new.zip)
    execute function spotter_private.reset_clubs_when_training_zip_changes();

create function spotter_private.get_local_clubs() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    area text;
begin
    select zip into area from spotter_private.profiles where user_id = actor;
    return (
        select jsonb_agg(jsonb_build_object(
            'id', club.id,
            'member_count', coalesce(local_members.member_count, 0),
            'joined', coalesce(local_members.joined, false)
        ) order by club.position)
        from (values ('running', 1), ('pickleball', 2), ('volleyball', 3), ('tennis', 4),
            ('hiking', 5), ('cycling', 6)) as club(id, position)
        left join (
            select membership.club_id, count(*)::integer as member_count,
                bool_or(membership.member_id = actor) as joined
            from spotter_private.local_club_memberships membership
            join spotter_private.profiles member on member.user_id = membership.member_id
                and member.active and member.zip = membership.training_zip
            where membership.training_zip = area
                and spotter_private.profile_is_visible(member.user_id)
                and not community_private.actors_are_blocked(actor, member.user_id)
            group by membership.club_id
        ) local_members on local_members.club_id = club.id
    );
end;
$$;

create function spotter_private.set_local_club_membership(p_club text, p_joined boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
    actor uuid := spotter_private.active_account();
    area text;
begin
    if p_club is null or p_club not in ('running', 'pickleball', 'volleyball', 'tennis', 'hiking', 'cycling')
        or p_joined is null then
        raise exception 'Choose a Spotter club and whether to join.' using errcode = '22023';
    end if;

    -- Serialize with profile moves and deletion so membership cannot land in a previous area.
    select zip into area from spotter_private.profiles
    where user_id = actor and active and spotter_private.profile_is_visible(actor) for update;
    if not found then
        raise exception 'Activate your Spotter profile first.' using errcode = '42501';
    end if;

    if p_joined then
        insert into spotter_private.local_club_memberships (member_id, club_id, training_zip)
        values (actor, p_club, area) on conflict (member_id, club_id) do nothing;
    else
        delete from spotter_private.local_club_memberships where member_id = actor and club_id = p_club;
    end if;
    return true;
end;
$$;

create function public.spotter_local_clubs() returns jsonb
language sql stable set search_path = '' as $$
    select spotter_private.get_local_clubs();
$$;

create function public.spotter_set_club_membership(p_club text, p_joined boolean) returns boolean
language sql set search_path = '' as $$
    select spotter_private.set_local_club_membership(p_club, p_joined);
$$;

revoke execute on function spotter_private.reset_clubs_when_training_zip_changes(),
    spotter_private.get_local_clubs(), spotter_private.set_local_club_membership(text, boolean),
    public.spotter_local_clubs(), public.spotter_set_club_membership(text, boolean)
    from public, anon, authenticated;
grant execute on function spotter_private.get_local_clubs(), spotter_private.set_local_club_membership(text, boolean),
    public.spotter_local_clubs(), public.spotter_set_club_membership(text, boolean) to authenticated;
